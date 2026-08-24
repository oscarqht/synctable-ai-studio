import type {
  BrowserTreeNode,
  CloudDeviceData,
  CloudSyncResponse,
  DeviceStats,
  RaindropUserProfile,
} from "../shared/types";

export const RAINDROP_COLLECTION_NAME = "Synctable";
export const RAINDROP_API_BASE = "https://api.raindrop.io/rest/v1";

export interface RaindropCollectionItem {
  _id: number;
  title: string;
  count?: number;
  parent?: { $id: number };
}

export interface RaindropItem {
  _id: number;
  title: string;
  excerpt?: string;
  link?: string;
  lastUpdate?: string;
  created?: string;
  file?: {
    name?: string;
    type?: string;
    size?: number;
  };
}

export function calculateNodeStats(nodes: BrowserTreeNode[]): DeviceStats {
  let totalNodes = 0;
  let totalTabs = 0;
  let totalWorkspaces = 0;
  let totalFolders = 0;
  let totalWindows = 0;
  const browsersSet = new Set<string>();

  function traverse(node: BrowserTreeNode) {
    totalNodes++;
    if (node.browser_name) {
      browsersSet.add(node.browser_name.toLowerCase());
    }

    if (node.node_type === "tab" || node.node_type === "pinned_tab") {
      totalTabs++;
    } else if (node.node_type === "workspace") {
      totalWorkspaces++;
    } else if (node.node_type === "folder") {
      totalFolders++;
    } else if (node.node_type === "window") {
      totalWindows++;
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return {
    totalNodes,
    totalTabs,
    totalWorkspaces,
    totalFolders,
    totalWindows,
    browsers: Array.from(browsersSet),
  };
}

export function ensureTreeHierarchy(nodes: any[]): BrowserTreeNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const sortRoots = (roots: BrowserTreeNode[]): BrowserTreeNode[] => {
    return roots.sort((a, b) => {
      const timeA = a.lastUpdateTime || a.snapshot_time || "";
      const timeB = b.lastUpdateTime || b.snapshot_time || "";
      if (timeA && timeB) {
        return timeB.localeCompare(timeA);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return a.sort_order - b.sort_order;
    });
  };

  const hasChildrenField = nodes.some(
    (n) => n.children && Array.isArray(n.children) && n.children.length > 0
  );
  if (hasChildrenField) {
    return sortRoots(nodes as BrowserTreeNode[]);
  }

  const nodeMap = new Map<string, BrowserTreeNode>();
  const rootNodes: BrowserTreeNode[] = [];

  for (const node of nodes) {
    if (node && node.id) {
      nodeMap.set(String(node.id), {
        ...node,
        lastUpdateTime: node.lastUpdateTime || node.snapshot_time,
        children: [],
      });
    }
  }

  for (const node of nodes) {
    if (!node || !node.id) continue;
    const current = nodeMap.get(String(node.id))!;
    if (node.parent_id && nodeMap.has(String(node.parent_id))) {
      const parent = nodeMap.get(String(node.parent_id))!;
      parent.children = parent.children || [];
      parent.children.push(current);
    } else {
      rootNodes.push(current);
    }
  }

  return rootNodes.length > 0 ? sortRoots(rootNodes) : sortRoots(nodes as BrowserTreeNode[]);
}

export class RaindropClient {
  private apiBase: string;

  constructor(apiBase: string = RAINDROP_API_BASE) {
    this.apiBase = apiBase;
  }

  /**
   * Fetch current user profile from Raindrop API
   */
  public async fetchUserProfile(token: string): Promise<RaindropUserProfile | null> {
    try {
      const res = await fetch(`${this.apiBase}/user`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as {
        result?: boolean;
        user?: {
          _id: number;
          fullName?: string;
          email?: string;
          email_MD5?: string;
          avatar?: string;
          pro?: boolean;
        };
      };

      if (!data.user) return null;

      const user = data.user;
      const avatarUrl = user.email_MD5
        ? `https://www.gravatar.com/avatar/${user.email_MD5}?d=mp`
        : user.avatar;

      return {
        id: user._id,
        name: user.fullName || "Raindrop User",
        email: user.email,
        avatarUrl,
        isPro: Boolean(user.pro),
      };
    } catch {
      return null;
    }
  }

  /**
   * Find a root collection named "Synctable". If it does not exist, create it.
   * Returns the collection ID.
   */
  public async findOrCreateSynctableCollection(token: string): Promise<number> {
    const res = await fetch(`${this.apiBase}/collections`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to list Raindrop collections (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { result?: boolean; items?: RaindropCollectionItem[] };
    const collections = data.items || [];
    const synctableCol = collections.find(
      (c) => c.title.trim().toLowerCase() === RAINDROP_COLLECTION_NAME.toLowerCase()
    );

    if (synctableCol) {
      return synctableCol._id;
    }

    // Create root collection named "Synctable"
    const createRes = await fetch(`${this.apiBase}/collection`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: RAINDROP_COLLECTION_NAME,
        view: "list",
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text().catch(() => "");
      throw new Error(`Failed to create Raindrop collection (${createRes.status}): ${errorText}`);
    }

    const createData = (await createRes.json()) as { result?: boolean; item?: RaindropCollectionItem };
    if (!createData.item?._id) {
      throw new Error("Raindrop create collection response missing item ID");
    }

    return createData.item._id;
  }

  /**
   * Find the collection named "Synctable" without creating it.
   */
  public async findSynctableCollection(token: string): Promise<RaindropCollectionItem | null> {
    const res = await fetch(`${this.apiBase}/collections`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to list Raindrop collections (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { result?: boolean; items?: RaindropCollectionItem[] };
    const collections = data.items || [];
    const synctableCol = collections.find(
      (c) => c.title?.trim().toLowerCase() === RAINDROP_COLLECTION_NAME.toLowerCase()
    );

    if (synctableCol) return synctableCol;

    try {
      const childRes = await fetch(`${this.apiBase}/collections/childrens`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(6000),
      });
      if (childRes.ok) {
        const childData = (await childRes.json()) as { result?: boolean; items?: RaindropCollectionItem[] };
        const childCol = childData.items?.find(
          (c) => c.title?.trim().toLowerCase() === RAINDROP_COLLECTION_NAME.toLowerCase()
        );
        if (childCol) return childCol;
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Fetch all Raindrop items under the specified collection ID.
   */
  public async fetchCollectionRaindrops(
    token: string,
    collectionId: number
  ): Promise<RaindropItem[]> {
    const allItems: RaindropItem[] = [];
    let page = 0;
    const perpage = 50;

    while (true) {
      const res = await fetch(
        `${this.apiBase}/raindrops/${collectionId}?perpage=${perpage}&page=${page}&sort=-lastUpdate`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(6000),
        }
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `Failed to fetch raindrops in collection ${collectionId} (${res.status}): ${errorText}`
        );
      }

      const data = (await res.json()) as {
        result?: boolean;
        items?: RaindropItem[];
        count?: number;
      };

      const items = data.items || [];
      allItems.push(...items);

      if (items.length < perpage) {
        break;
      }
      page++;
      if (page > 10) break;
    }

    return allItems;
  }

  /**
   * Fetch file content of a Raindrop item with AWS S3 redirect protection.
   */
  public async fetchRaindropFileContent(
    token: string,
    item: RaindropItem
  ): Promise<any | null> {
    const primaryApiUrl = `${this.apiBase}/raindrop/${item._id}/file`;

    // 1. Try primary endpoint with manual redirect so Authorization header isn't forwarded to S3
    try {
      const res = await fetch(primaryApiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Synctable/1.0",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
      });

      if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
        const redirectUrl = res.headers.get("location");
        if (redirectUrl) {
          const fileRes = await fetch(redirectUrl, {
            method: "GET",
            signal: AbortSignal.timeout(6000),
          });
          if (fileRes.ok) {
            const text = await fileRes.text();
            if (text && text.trim()) {
              return JSON.parse(text);
            }
          }
        }
      } else if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) {
          return JSON.parse(text);
        }
      }
    } catch (err) {
      console.warn(`[Raindrop] Error fetching from ${primaryApiUrl}:`, err);
    }

    // 2. Fallback: try item.link without Authorization header
    if (item.link) {
      try {
        const res = await fetch(item.link, {
          method: "GET",
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) {
            return JSON.parse(text);
          }
        }
      } catch (err) {
        console.warn(`[Raindrop] Error fetching from item.link ${item.link}:`, err);
      }
    }

    return null;
  }

  /**
   * Search for existing raindrop items in the collection with the same device name/identifier,
   * and delete them.
   */
  public async deleteExistingDeviceRaindrops(
    token: string,
    collectionId: number,
    deviceId: string
  ): Promise<void> {
    const items = await this.fetchCollectionRaindrops(token, collectionId);

    const targetTxtName = `${deviceId}.txt`;
    const targetJsonName = `${deviceId}.json`;
    const matchingItems = items.filter((item) => {
      const title = item.title?.trim();
      const fileName = item.file?.name?.trim();
      return (
        title === deviceId ||
        title === targetTxtName ||
        title === targetJsonName ||
        fileName === deviceId ||
        fileName === targetTxtName ||
        fileName === targetJsonName ||
        title?.startsWith(deviceId) ||
        fileName?.startsWith(deviceId)
      );
    });

    for (const item of matchingItems) {
      const deleteRes = await fetch(`${this.apiBase}/raindrop/${item._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!deleteRes.ok) {
        const errorText = await deleteRes.text().catch(() => "");
        throw new Error(`[Raindrop] Failed to delete existing item ${item._id} (${deleteRes.status}): ${errorText}`);
      }

      const resJson = await deleteRes.json().catch(() => ({}));
      if (resJson.result === false) {
         throw new Error(`[Raindrop] Failed to delete existing item ${item._id}: API returned result false`);
      }
    }
  }

  /**
   * Upload the full tree as a JSON file to the collection.
   */
  public async uploadTreeFile(
    token: string,
    collectionId: number,
    deviceId: string,
    tree: BrowserTreeNode[]
  ): Promise<number | undefined> {
    const jsonContent = JSON.stringify(tree, null, 2);
    const blob = new Blob([jsonContent], { type: "text/plain" });

    const formData = new FormData();
    formData.append("collectionId", String(collectionId));
    formData.append("file", blob, `${deviceId}.txt`);

    const res = await fetch(`${this.apiBase}/raindrop/file`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Failed to upload tree file to Raindrop (${res.status}): ${errorText}`);
    }

    const data = (await res.json().catch(() => ({}))) as { result?: boolean; item?: { _id?: number } };
    return data.item?._id;
  }

  /**
   * Update the excerpt (description) of a raindrop item.
   */
  public async updateRaindropExcerpt(
    token: string,
    raindropId: number,
    excerpt: string
  ): Promise<void> {
    const res = await fetch(`${this.apiBase}/raindrop/${raindropId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ excerpt }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(`[Raindrop] Failed to update excerpt for item ${raindropId} (${res.status}): ${errorText}`);
    }
  }

  /**
   * Fetch all cloud devices and parse their browser trees from the Synctable collection.
   */
  public async fetchCloudDevices(token: string): Promise<CloudSyncResponse> {
    if (!token || !token.trim()) {
      return {
        authenticated: false,
        devices: [],
        error: "Raindrop API token is not configured.",
      };
    }

    try {
      const [user, collection] = await Promise.all([
        this.fetchUserProfile(token),
        this.findSynctableCollection(token),
      ]);

      if (!collection) {
        return {
          authenticated: true,
          user,
          collection: null,
          devices: [],
        };
      }

      const items = await this.fetchCollectionRaindrops(token, collection._id);
      const settledResults = await Promise.allSettled(
        items.map(async (item): Promise<CloudDeviceData> => {
          const rawContent = await this.fetchRaindropFileContent(token, item);
          const tree = rawContent ? ensureTreeHierarchy(rawContent) : [];
          const stats = calculateNodeStats(tree);

          const rawFileName = item.file?.name || item.title || `device_${item._id}`;
          const deviceId = rawFileName
            .replace(/\.(txt|json)$/i, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_");

          const deviceName =
            item.excerpt?.trim() ||
            item.title?.replace(/\.(txt|json)$/i, "") ||
            `Device ${deviceId.slice(0, 8)}`;

          return {
            id: item._id,
            deviceId,
            deviceName,
            fileName: rawFileName,
            fileSize: item.file?.size,
            lastUpdated: item.lastUpdate || item.created || new Date().toISOString(),
            tree,
            stats,
          };
        })
      );

      const deviceResults: CloudDeviceData[] = [];
      for (const res of settledResults) {
        if (res.status === "fulfilled") {
          deviceResults.push(res.value);
        }
      }


      return {
        authenticated: true,
        user,
        collection: {
          id: collection._id,
          title: collection.title,
          count: collection.count ?? items.length,
        },
        devices: deviceResults,
      };
    } catch (err: any) {
      console.error("[RaindropClient] fetchCloudDevices error:", err);
      return {
        authenticated: true,
        collection: null,
        devices: [],
        error: err?.message || "Failed to fetch device data from Raindrop",
      };
    }
  }


  /**
   * Orchestrates the complete Raindrop sync flow:
   * 1. Find or create root collection "Synctable"
   * 2. Delete existing device items with the same name
   * 3. Upload the latest full tree JSON
   * 4. Set readable device name as the item's excerpt (description)
   */
  public async syncTree(
    token: string,
    deviceId: string,
    tree: BrowserTreeNode[],
    deviceName?: string
  ): Promise<{ collectionId: number; raindropId?: number }> {
    const collectionId = await this.findOrCreateSynctableCollection(token);
    await this.deleteExistingDeviceRaindrops(token, collectionId, deviceId);
    const raindropId = await this.uploadTreeFile(token, collectionId, deviceId, tree);
    if (raindropId && deviceName) {
      await this.updateRaindropExcerpt(token, raindropId, deviceName);
    }
    return { collectionId, raindropId };
  }
}

export const defaultRaindropClient = new RaindropClient();

