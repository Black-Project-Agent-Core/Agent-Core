using System.ComponentModel;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace AgentCore.Launcher;

public static class WindowsTcpListener
{
    private const uint InsufficientBuffer = 122;
    private const int OwnerPidListener = 3;

    public static int? GetProcessId(int port)
    {
        if (port is < 1 or > 65535) throw new ArgumentOutOfRangeException(nameof(port));
        return ReadTable(port, AddressFamily.InterNetwork, 24, 8, 20)
            ?? ReadTable(port, AddressFamily.InterNetworkV6, 56, 20, 52);
    }

    private static int? ReadTable(int port, AddressFamily family, int rowSize, int portOffset, int pidOffset)
    {
        // MIB_TCP[6]ROW_OWNER_PID uses DWORD alignment; ports are network-order bytes.
        uint size = 0;
        var result = GetExtendedTcpTable(IntPtr.Zero, ref size, false, (uint)family, OwnerPidListener, 0);
        if (result != InsufficientBuffer) throw new Win32Exception((int)result);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var capacity = checked((int)size);
            var buffer = Marshal.AllocHGlobal(capacity);
            try
            {
                result = GetExtendedTcpTable(buffer, ref size, false, (uint)family, OwnerPidListener, 0);
                if (result == InsufficientBuffer) continue;
                if (result != 0) throw new Win32Exception((int)result);
                if (capacity < sizeof(int)) throw new InvalidDataException("Invalid Windows TCP table size.");
                var count = Marshal.ReadInt32(buffer);
                if (count < 0 || count > (capacity - sizeof(int)) / rowSize)
                    throw new InvalidDataException("Invalid Windows TCP table row count.");
                for (var index = 0; index < count; index++)
                {
                    var row = IntPtr.Add(buffer, sizeof(int) + index * rowSize);
                    var localPort = (Marshal.ReadByte(row, portOffset) << 8) | Marshal.ReadByte(row, portOffset + 1);
                    if (localPort == port) return Marshal.ReadInt32(row, pidOffset);
                }
                return null;
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        throw new Win32Exception((int)result);
    }

    [DllImport("iphlpapi.dll")]
    private static extern uint GetExtendedTcpTable(
        IntPtr table, ref uint size, [MarshalAs(UnmanagedType.Bool)] bool order,
        uint family, int tableClass, uint reserved);
}
