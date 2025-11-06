namespace UEMAgent.Models;

public class ComputerInfo
{
    public string ComputerId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string OsType { get; set; } = "Windows";
    public string OsVersion { get; set; } = string.Empty;
    public string? OsBuild { get; set; }
    public string Architecture { get; set; } = "x64";
    public string? Hostname { get; set; }
    public string? Domain { get; set; }
    public string? LoggedInUser { get; set; }
    public string? CpuModel { get; set; }
    public int CpuCores { get; set; }
    public int CpuThreads { get; set; }
    public long MemoryTotal { get; set; }
    public long MemoryUsed { get; set; }
    public long StorageTotal { get; set; }
    public long StorageUsed { get; set; }
    public List<StorageDrive> StorageDrives { get; set; } = new();
    public string? IpAddress { get; set; }
    public string? MacAddress { get; set; }
    public string? NetworkType { get; set; }
    public string? WifiSSID { get; set; }
    public bool IsWifiEnabled { get; set; }
    public bool IsBluetoothEnabled { get; set; }
    public string? AgentVersion { get; set; }
    public List<InstalledProgram> InstalledPrograms { get; set; } = new();
    public bool AntivirusInstalled { get; set; }
    public bool AntivirusEnabled { get; set; }
    public string? AntivirusName { get; set; }
    public bool FirewallEnabled { get; set; }
    public bool EncryptionEnabled { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? LocationAccuracy { get; set; }
    public string? LocationAddress { get; set; }
    public string? LocationSource { get; set; }
}

public class StorageDrive
{
    public string Drive { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string? FileSystem { get; set; }
    public long Total { get; set; }
    public long Used { get; set; }
    public long Free { get; set; }
}

public class InstalledProgram
{
    public string Name { get; set; } = string.Empty;
    public string? Version { get; set; }
    public string? Publisher { get; set; }
    public long? InstallDate { get; set; }
    public string? InstallLocation { get; set; }
    public long? Size { get; set; }
}

