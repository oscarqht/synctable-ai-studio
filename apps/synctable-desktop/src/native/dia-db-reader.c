#include <CommonCrypto/CommonHMAC.h>
#include <CommonCrypto/CommonKeyDerivation.h>
#include <CommonCrypto/CommonCryptoError.h>
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;

enum {
  SQLITE_OK = 0,
  SQLITE_INTEGER = 1,
  SQLITE_FLOAT = 2,
  SQLITE_TEXT = 3,
  SQLITE_BLOB = 4,
  SQLITE_NULL = 5,
  SQLITE_ROW = 100,
  SQLITE_DONE = 101,
  SQLITE_OPEN_READONLY = 0x00000001,
};

typedef int (*sqlite3_open_v2_fn)(const char *, sqlite3 **, int, const char *);
typedef int (*sqlite3_key_fn)(sqlite3 *, const void *, int);
typedef int (*sqlite3_prepare_v2_fn)(sqlite3 *, const char *, int, sqlite3_stmt **, const char **);
typedef int (*sqlite3_step_fn)(sqlite3_stmt *);
typedef int (*sqlite3_column_count_fn)(sqlite3_stmt *);
typedef const char *(*sqlite3_column_name_fn)(sqlite3_stmt *, int);
typedef int (*sqlite3_column_type_fn)(sqlite3_stmt *, int);
typedef int64_t (*sqlite3_column_int64_fn)(sqlite3_stmt *, int);
typedef double (*sqlite3_column_double_fn)(sqlite3_stmt *, int);
typedef const unsigned char *(*sqlite3_column_text_fn)(sqlite3_stmt *, int);
typedef const void *(*sqlite3_column_blob_fn)(sqlite3_stmt *, int);
typedef int (*sqlite3_column_bytes_fn)(sqlite3_stmt *, int);
typedef int (*sqlite3_finalize_fn)(sqlite3_stmt *);
typedef int (*sqlite3_close_fn)(sqlite3 *);
typedef const char *(*sqlite3_errmsg_fn)(sqlite3 *);

typedef struct {
  sqlite3_open_v2_fn open_v2;
  sqlite3_key_fn key;
  sqlite3_prepare_v2_fn prepare_v2;
  sqlite3_step_fn step;
  sqlite3_column_count_fn column_count;
  sqlite3_column_name_fn column_name;
  sqlite3_column_type_fn column_type;
  sqlite3_column_int64_fn column_int64;
  sqlite3_column_double_fn column_double;
  sqlite3_column_text_fn column_text;
  sqlite3_column_blob_fn column_blob;
  sqlite3_column_bytes_fn column_bytes;
  sqlite3_finalize_fn finalize;
  sqlite3_close_fn close;
  sqlite3_errmsg_fn errmsg;
} SQLiteAPI;

static void *required_symbol(void *handle, const char *name) {
  void *symbol = dlsym(handle, name);
  if (!symbol) {
    fprintf(stderr, "Dia SQLCipher runtime is missing symbol %s.\n", name);
    exit(2);
  }
  return symbol;
}

static SQLiteAPI load_sqlite(void) {
  const char *override = getenv("SYNCTABLE_DIA_GRDB");
  const char *framework = override && override[0]
    ? override
    : "/Applications/Dia.app/Contents/Frameworks/GRDB.framework/GRDB";
  void *handle = dlopen(framework, RTLD_NOW | RTLD_LOCAL);
  if (!handle) {
    fprintf(stderr, "Unable to load Dia's SQLCipher runtime at %s.\n", framework);
    exit(2);
  }
  return (SQLiteAPI) {
    .open_v2 = required_symbol(handle, "sqlite3_open_v2"),
    .key = required_symbol(handle, "sqlite3_key"),
    .prepare_v2 = required_symbol(handle, "sqlite3_prepare_v2"),
    .step = required_symbol(handle, "sqlite3_step"),
    .column_count = required_symbol(handle, "sqlite3_column_count"),
    .column_name = required_symbol(handle, "sqlite3_column_name"),
    .column_type = required_symbol(handle, "sqlite3_column_type"),
    .column_int64 = required_symbol(handle, "sqlite3_column_int64"),
    .column_double = required_symbol(handle, "sqlite3_column_double"),
    .column_text = required_symbol(handle, "sqlite3_column_text"),
    .column_blob = required_symbol(handle, "sqlite3_column_blob"),
    .column_bytes = required_symbol(handle, "sqlite3_column_bytes"),
    .finalize = required_symbol(handle, "sqlite3_finalize"),
    .close = required_symbol(handle, "sqlite3_close"),
    .errmsg = required_symbol(handle, "sqlite3_errmsg"),
  };
}

static CFDataRef read_safe_storage_secret(void) {
  const void *keys[] = {
    kSecClass,
    kSecAttrService,
    kSecAttrAccount,
    kSecReturnData,
    kSecMatchLimit,
  };
  const void *values[] = {
    kSecClassGenericPassword,
    CFSTR("Dia Safe Storage"),
    CFSTR("Dia"),
    kCFBooleanTrue,
    kSecMatchLimitOne,
  };
  CFDictionaryRef query = CFDictionaryCreate(
    kCFAllocatorDefault,
    keys,
    values,
    sizeof(keys) / sizeof(keys[0]),
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  );
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching(query, &result);
  CFRelease(query);
  if (status != errSecSuccess || !result || CFGetTypeID(result) != CFDataGetTypeID()) {
    if (result) CFRelease(result);
    fprintf(stderr, "Unable to read Dia Safe Storage from macOS Keychain (status %d).\n", (int) status);
    return NULL;
  }
  return (CFDataRef) result;
}

static int derive_database_key(CFDataRef secret, const char *context, unsigned char output[32]) {
  // Dia first derives Chromium's 128-bit macOS safe-storage key, then derives
  // an isolated 256-bit SQLCipher key for each profile/database context.
  static const unsigned char chromium_salt[] = "saltysalt";
  static const unsigned char derivation_key[32] = {
    0x88, 0xe7, 0xb5, 0x51, 0xef, 0xd7, 0xb6, 0x89,
    0xdb, 0x89, 0xe1, 0x3f, 0xe6, 0x6d, 0x67, 0x02,
    0x07, 0xb0, 0xbd, 0x64, 0x25, 0x78, 0xf1, 0xd1,
    0x70, 0xa9, 0xe8, 0x53, 0x5d, 0x04, 0xc8, 0xe3,
  };
  unsigned char root_key[16];
  unsigned char hkdf_salt[CC_SHA256_DIGEST_LENGTH];
  unsigned char prk[CC_SHA256_DIGEST_LENGTH];
  unsigned char expand_input[4096];
  size_t context_length = strlen(context);
  if (context_length + 1 > sizeof(expand_input)) return 0;

  int result = CCKeyDerivationPBKDF(
    kCCPBKDF2,
    (const char *) CFDataGetBytePtr(secret),
    (size_t) CFDataGetLength(secret),
    chromium_salt,
    sizeof(chromium_salt) - 1,
    kCCPRFHmacAlgSHA1,
    1003,
    root_key,
    sizeof(root_key)
  );
  if (result != kCCSuccess) return 0;

  CCHmac(kCCHmacAlgSHA256, derivation_key, sizeof(derivation_key), context, context_length, hkdf_salt);
  CCHmac(kCCHmacAlgSHA256, hkdf_salt, sizeof(hkdf_salt), root_key, sizeof(root_key), prk);
  memcpy(expand_input, context, context_length);
  expand_input[context_length] = 1;
  CCHmac(kCCHmacAlgSHA256, prk, sizeof(prk), expand_input, context_length + 1, output);

  memset(root_key, 0, sizeof(root_key));
  memset(hkdf_salt, 0, sizeof(hkdf_salt));
  memset(prk, 0, sizeof(prk));
  memset(expand_input, 0, sizeof(expand_input));
  return 1;
}

static sqlite3 *try_open(SQLiteAPI api, const char *path, const void *key, int key_length) {
  sqlite3 *db = NULL;
  // Read-only mode still participates in SQLite's WAL snapshot, so this sees
  // committed live state without copying or mutating Dia's files.
  if (api.open_v2(path, &db, SQLITE_OPEN_READONLY, NULL) != SQLITE_OK) return NULL;
  if (api.key(db, key, key_length) != SQLITE_OK) {
    api.close(db);
    return NULL;
  }
  sqlite3_stmt *statement = NULL;
  if (api.prepare_v2(db, "SELECT count(*) FROM sqlite_master", -1, &statement, NULL) != SQLITE_OK ||
      api.step(statement) != SQLITE_ROW) {
    if (statement) api.finalize(statement);
    api.close(db);
    return NULL;
  }
  api.finalize(statement);
  return db;
}

static sqlite3 *open_database(SQLiteAPI api, const char *path, const unsigned char key[32]) {
  sqlite3 *db = try_open(api, path, key, 32);
  if (db) return db;

  char hex_key[68];
  strcpy(hex_key, "x'");
  for (int index = 0; index < 32; index++) {
    snprintf(hex_key + 2 + index * 2, 3, "%02x", key[index]);
  }
  strcat(hex_key, "'");
  db = try_open(api, path, hex_key, 67);
  memset(hex_key, 0, sizeof(hex_key));
  return db;
}

static void print_json_string_bytes(const unsigned char *value, int length) {
  putchar('"');
  for (int index = 0; index < length; index++) {
    unsigned char byte = value[index];
    switch (byte) {
      case '"': fputs("\\\"", stdout); break;
      case '\\': fputs("\\\\", stdout); break;
      case '\b': fputs("\\b", stdout); break;
      case '\f': fputs("\\f", stdout); break;
      case '\n': fputs("\\n", stdout); break;
      case '\r': fputs("\\r", stdout); break;
      case '\t': fputs("\\t", stdout); break;
      default:
        if (byte < 0x20) printf("\\u%04x", byte);
        else putchar(byte);
    }
  }
  putchar('"');
}

static void print_json_string(const char *value) {
  print_json_string_bytes((const unsigned char *) value, (int) strlen(value));
}

static void print_blob(const unsigned char *bytes, int length) {
  fputs("{\"$blob\":\"", stdout);
  for (int index = 0; index < length; index++) printf("%02x", bytes[index]);
  fputs("\"}", stdout);
}

static void print_column(SQLiteAPI api, sqlite3_stmt *statement, int index) {
  switch (api.column_type(statement, index)) {
    case SQLITE_INTEGER:
      printf("%lld", (long long) api.column_int64(statement, index));
      break;
    case SQLITE_FLOAT:
      printf("%.17g", api.column_double(statement, index));
      break;
    case SQLITE_TEXT: {
      const unsigned char *text = api.column_text(statement, index);
      print_json_string_bytes(text, api.column_bytes(statement, index));
      break;
    }
    case SQLITE_BLOB:
      print_blob(api.column_blob(statement, index), api.column_bytes(statement, index));
      break;
    case SQLITE_NULL:
    default:
      fputs("null", stdout);
      break;
  }
}

static int print_table(SQLiteAPI api, sqlite3 *db, const char *table) {
  char sql[128];
  snprintf(sql, sizeof(sql), "SELECT * FROM \"%s\"", table);
  sqlite3_stmt *statement = NULL;
  if (api.prepare_v2(db, sql, -1, &statement, NULL) != SQLITE_OK) return 0;

  print_json_string(table);
  fputs(":[", stdout);
  int row_index = 0;
  int status;
  while ((status = api.step(statement)) == SQLITE_ROW) {
    if (row_index++) putchar(',');
    putchar('{');
    int count = api.column_count(statement);
    for (int column = 0; column < count; column++) {
      if (column) putchar(',');
      print_json_string(api.column_name(statement, column));
      putchar(':');
      print_column(api, statement, column);
    }
    putchar('}');
  }
  putchar(']');
  api.finalize(statement);
  return status == SQLITE_DONE;
}

static int print_database(SQLiteAPI api, const char *path, const char *context, CFDataRef secret) {
  unsigned char key[32];
  if (!derive_database_key(secret, context, key)) {
    fprintf(stderr, "Unable to derive the encryption key for %s.\n", path);
    return 0;
  }
  sqlite3 *db = open_database(api, path, key);
  memset(key, 0, sizeof(key));
  if (!db) {
    fprintf(stderr, "Unable to decrypt Dia database %s.\n", path);
    return 0;
  }

  static const char *tables[] = {
    "nodes",
    "spaces",
    "windows",
    "tab_groups",
    "tabs",
    "content_panes",
    "web_contents",
    "supertabs",
  };
  fputs("{\"path\":", stdout);
  print_json_string(path);
  fputs(",\"context\":", stdout);
  print_json_string(context);
  fputs(",\"tables\":{", stdout);
  int printed = 0;
  for (size_t index = 0; index < sizeof(tables) / sizeof(tables[0]); index++) {
    sqlite3_stmt *probe = NULL;
    char probe_sql[160];
    snprintf(probe_sql, sizeof(probe_sql), "SELECT 1 FROM sqlite_master WHERE type='table' AND name='%s'", tables[index]);
    int exists = api.prepare_v2(db, probe_sql, -1, &probe, NULL) == SQLITE_OK && api.step(probe) == SQLITE_ROW;
    if (probe) api.finalize(probe);
    if (!exists) continue;
    if (printed++) putchar(',');
    if (!print_table(api, db, tables[index])) {
      api.close(db);
      return 0;
    }
  }
  fputs("}}", stdout);
  api.close(db);
  return 1;
}

int main(int argc, char **argv) {
  if (argc < 3 || argc % 2 == 0) {
    fprintf(stderr, "Usage: dia-db-reader DATABASE CONTEXT [DATABASE CONTEXT ...]\n");
    return 2;
  }

  CFDataRef secret = read_safe_storage_secret();
  if (!secret) return 1;
  SQLiteAPI api = load_sqlite();

  fputs("{\"databases\":[", stdout);
  int success = 1;
  for (int index = 1; index < argc; index += 2) {
    if (index > 1) putchar(',');
    if (!print_database(api, argv[index], argv[index + 1], secret)) {
      success = 0;
      break;
    }
  }
  fputs("]}\n", stdout);
  CFRelease(secret);
  return success ? 0 : 1;
}
