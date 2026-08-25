using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Synctable.Native {
    public class WinFileReader {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr CreateFile(
            string lpFileName,
            uint dwDesiredAccess,
            uint dwShareMode,
            IntPtr lpSecurityAttributes,
            uint dwCreationDisposition,
            uint dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool DeviceIoControl(
            IntPtr hDevice,
            uint dwIoControlCode,
            IntPtr lpInBuffer,
            uint nInBufferSize,
            IntPtr lpOutBuffer,
            uint nOutBufferSize,
            out uint lpBytesReturned,
            IntPtr lpOverlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetFilePointerEx(IntPtr hFile, long liDistanceToMove, out long lpNewFilePointer, uint dwMoveMethod);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool ReadFile(IntPtr hFile, [Out] byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetDiskFreeSpace(
            string lpRootPathName,
            out uint lpSectorsPerCluster,
            out uint lpBytesPerSector,
            out uint lpNumberOfFreeClusters,
            out uint lpTotalNumberOfClusters);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetFileSizeEx(IntPtr hFile, out long lpFileSize);

        const uint FILE_READ_ATTRIBUTES = 0x0080;
        const uint FILE_SHARE_READ = 0x00000001;
        const uint FILE_SHARE_WRITE = 0x00000002;
        const uint FILE_SHARE_DELETE = 0x00000004;
        const uint OPEN_EXISTING = 3;
        const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
        const uint FSCTL_GET_RETRIEVAL_POINTERS = 0x00090073;
        const uint FSCTL_ALLOW_EXTENDED_DASD_IO = 0x00090083;
        const uint GENERIC_READ = 0x80000000;

        [StructLayout(LayoutKind.Sequential)]
        public struct STARTING_VCN_INPUT_BUFFER {
            public long StartingVcn;
        }

        public static bool TryRawVolumeCopy(string sourcePath, string destPath) {
            try {
                string driveLetter = Path.GetPathRoot(sourcePath).TrimEnd('\\');
                string volumePath = @"\\.\" + driveLetter;

                uint spc, bps, nfc, tnc;
                if (!GetDiskFreeSpace(driveLetter + @"\", out spc, out bps, out nfc, out tnc)) {
                    return false;
                }
                long clusterSize = (long)spc * bps;
                if (clusterSize <= 0) return false;

                IntPtr hFile = CreateFile(
                    sourcePath,
                    FILE_READ_ATTRIBUTES,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    FILE_FLAG_BACKUP_SEMANTICS,
                    IntPtr.Zero);

                if (hFile == (IntPtr)(-1) || hFile == IntPtr.Zero) {
                    return false;
                }

                long fileSize = 0;
                GetFileSizeEx(hFile, out fileSize);
                if (fileSize == 0) {
                    CloseHandle(hFile);
                    File.WriteAllBytes(destPath, new byte[0]);
                    return true;
                }

                STARTING_VCN_INPUT_BUFFER input = new STARTING_VCN_INPUT_BUFFER { StartingVcn = 0 };
                IntPtr inBuffer = Marshal.AllocHGlobal(Marshal.SizeOf(input));
                Marshal.StructureToPtr(input, inBuffer, false);

                int outBufferSize = 64 * 1024;
                IntPtr outBuffer = Marshal.AllocHGlobal(outBufferSize);
                uint bytesReturned;

                bool ioOk = DeviceIoControl(
                    hFile,
                    FSCTL_GET_RETRIEVAL_POINTERS,
                    inBuffer,
                    (uint)Marshal.SizeOf(input),
                    outBuffer,
                    (uint)outBufferSize,
                    out bytesReturned,
                    IntPtr.Zero);

                int lastErr = Marshal.GetLastWin32Error();
                CloseHandle(hFile);
                Marshal.FreeHGlobal(inBuffer);

                if (!ioOk && lastErr != 234) { // ERROR_MORE_DATA = 234
                    Marshal.FreeHGlobal(outBuffer);
                    return false;
                }

                int extentCount = Marshal.ReadInt32(outBuffer);
                long startingVcn = Marshal.ReadInt64(new IntPtr(outBuffer.ToInt64() + 8));

                IntPtr hVolume = CreateFile(
                    volumePath,
                    GENERIC_READ,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    IntPtr.Zero,
                    OPEN_EXISTING,
                    0,
                    IntPtr.Zero);

                if (hVolume == (IntPtr)(-1) || hVolume == IntPtr.Zero) {
                    Marshal.FreeHGlobal(outBuffer);
                    return false;
                }

                uint dasdBytes;
                DeviceIoControl(hVolume, FSCTL_ALLOW_EXTENDED_DASD_IO, IntPtr.Zero, 0, IntPtr.Zero, 0, out dasdBytes, IntPtr.Zero);

                string tempDest = destPath + ".tmp";
                using (FileStream fsOut = new FileStream(tempDest, FileMode.Create, FileAccess.Write, FileShare.None)) {
                    long currentOffset = 0;
                    long currentVcn = startingVcn;
                    IntPtr extentsPtr = new IntPtr(outBuffer.ToInt64() + 16);

                    for (int i = 0; i < extentCount && currentOffset < fileSize; i++) {
                        long nextVcn = Marshal.ReadInt64(extentsPtr);
                        long lcn = Marshal.ReadInt64(new IntPtr(extentsPtr.ToInt64() + 8));
                        extentsPtr = new IntPtr(extentsPtr.ToInt64() + 16);

                        long clusterCount = nextVcn - currentVcn;
                        currentVcn = nextVcn;

                        if (lcn == -1) {
                            long zeroBytes = clusterCount * clusterSize;
                            byte[] zeros = new byte[Math.Min(zeroBytes, 64 * 1024)];
                            long written = 0;
                            while (written < zeroBytes && currentOffset < fileSize) {
                                int toWrite = (int)Math.Min((long)zeros.Length, Math.Min(zeroBytes - written, fileSize - currentOffset));
                                fsOut.Write(zeros, 0, toWrite);
                                written += toWrite;
                                currentOffset += toWrite;
                            }
                            continue;
                        }

                        long byteOffsetOnDisk = lcn * clusterSize;
                        long bytesToReadThisExtent = Math.Min(clusterCount * clusterSize, fileSize - currentOffset);

                        long newPos = 0;
                        SetFilePointerEx(hVolume, byteOffsetOnDisk, out newPos, 0);

                        byte[] clusterData = new byte[clusterCount * clusterSize];
                        uint actualRead = 0;
                        ReadFile(hVolume, clusterData, (uint)clusterData.Length, out actualRead, IntPtr.Zero);

                        int copyLen = (int)Math.Min((long)actualRead, bytesToReadThisExtent);
                        if (copyLen > 0) {
                            fsOut.Write(clusterData, 0, copyLen);
                            currentOffset += copyLen;
                        }
                    }
                }

                CloseHandle(hVolume);
                Marshal.FreeHGlobal(outBuffer);

                if (File.Exists(destPath)) File.Delete(destPath);
                File.Move(tempDest, destPath);
                return true;
            } catch {
                return false;
            }
        }

        public static int Main(string[] args) {
            if (args.Length < 2) {
                Console.Error.WriteLine("Usage: win-file-reader.exe <sourcePath> <destPath>");
                return 1;
            }

            string sourcePath = Path.GetFullPath(args[0]);
            string destPath = Path.GetFullPath(args[1]);

            if (!File.Exists(sourcePath)) {
                Console.Error.WriteLine("Source file does not exist: " + sourcePath);
                return 2;
            }

            string destDir = Path.GetDirectoryName(destPath);
            if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir)) {
                Directory.CreateDirectory(destDir);
            }

            // 1. Try standard FileStream with shared read/write/delete
            try {
                using (FileStream srcStream = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (FileStream dstStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None)) {
                    srcStream.CopyTo(dstStream);
                }
                return 0;
            } catch {
                // If standard stream read fails, attempt raw volume read
            }

            // 2. Try raw volume cluster reader (bypasses Windows file sharing locks when elevated)
            if (TryRawVolumeCopy(sourcePath, destPath)) {
                return 0;
            }

            Console.Error.WriteLine("Failed to copy locked file: " + sourcePath);
            return 3;
        }
    }
}
