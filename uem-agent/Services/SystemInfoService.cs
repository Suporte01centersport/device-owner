using System.Management;
using System.Net.NetworkInformation;
using System.Security.Principal;
using Microsoft.Win32;
using UEMAgent.Models;
using System.IO;
using System.Net.Http;

namespace UEMAgent.Services;

public class SystemInfoService
{
    private readonly string _computerId;
    private static string? _cachedPublicIP = null;
    private static DateTime _lastPublicIPCheck = DateTime.MinValue;
    private static readonly TimeSpan _publicIPCacheTimeout = TimeSpan.FromMinutes(10);

    public SystemInfoService()
    {
        _computerId = GetComputerId();
    }

    public string GetComputerId()
    {
        // Usar serial number da placa mãe ou MAC address como fallback
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BaseBoard");
            foreach (ManagementObject obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString();
                if (!string.IsNullOrEmpty(serial) && serial != "To be filled by O.E.M.")
                {
                    return serial;
                }
            }
        }
        catch { }

        // Fallback para MAC address
        try
        {
            var macAddress = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up && 
                             nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(nic => nic.GetPhysicalAddress().ToString())
                .FirstOrDefault();

            if (!string.IsNullOrEmpty(macAddress))
            {
                return macAddress;
            }
        }
        catch { }

        return Environment.MachineName;
    }

    public async Task<ComputerInfo> GetComputerInfoAsync()
    {
        // Obter IP público de forma assíncrona
        var publicIP = await GetPublicIpAddressAsync();
        var ipAddress = publicIP ?? GetIpAddress(); // IP público ou privado como fallback

        var info = new ComputerInfo
        {
            ComputerId = _computerId,
            Name = Environment.MachineName,
            OsType = "Windows",
            OsVersion = Environment.OSVersion.VersionString,
            OsBuild = GetWindowsBuild(),
            Architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86",
            Hostname = Environment.MachineName,
            Domain = Environment.UserDomainName,
            LoggedInUser = WindowsIdentity.GetCurrent().Name,
            CpuModel = GetCpuModel(),
            CpuCores = Environment.ProcessorCount,
            CpuThreads = GetCpuThreads(),
            MemoryTotal = GetTotalMemory(),
            MemoryUsed = GetUsedMemory(),
            StorageTotal = GetTotalStorage(),
            StorageUsed = GetUsedStorage(),
            StorageDrives = GetStorageDrives(),
            IpAddress = ipAddress,
            MacAddress = GetMacAddress(),
            NetworkType = GetNetworkType(),
            WifiSSID = GetWifiSSID(),
            IsWifiEnabled = IsWifiEnabled(),
            IsBluetoothEnabled = IsBluetoothEnabled(),
            AgentVersion = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0",
            InstalledPrograms = GetInstalledPrograms(),
            AntivirusInstalled = IsAntivirusInstalled(),
            AntivirusEnabled = IsAntivirusEnabled(),
            AntivirusName = GetAntivirusName(),
            FirewallEnabled = IsFirewallEnabled(),
            EncryptionEnabled = IsEncryptionEnabled()
        };

        return info;
    }

    // Método síncrono para compatibilidade (usa IP privado)
    public ComputerInfo GetComputerInfo()
    {
        var info = new ComputerInfo
        {
            ComputerId = _computerId,
            Name = Environment.MachineName,
            OsType = "Windows",
            OsVersion = Environment.OSVersion.VersionString,
            OsBuild = GetWindowsBuild(),
            Architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86",
            Hostname = Environment.MachineName,
            Domain = Environment.UserDomainName,
            LoggedInUser = WindowsIdentity.GetCurrent().Name,
            CpuModel = GetCpuModel(),
            CpuCores = Environment.ProcessorCount,
            CpuThreads = GetCpuThreads(),
            MemoryTotal = GetTotalMemory(),
            MemoryUsed = GetUsedMemory(),
            StorageTotal = GetTotalStorage(),
            StorageUsed = GetUsedStorage(),
            StorageDrives = GetStorageDrives(),
            IpAddress = GetIpAddress(), // IP privado apenas
            MacAddress = GetMacAddress(),
            NetworkType = GetNetworkType(),
            WifiSSID = GetWifiSSID(),
            IsWifiEnabled = IsWifiEnabled(),
            IsBluetoothEnabled = IsBluetoothEnabled(),
            AgentVersion = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0",
            InstalledPrograms = GetInstalledPrograms(),
            AntivirusInstalled = IsAntivirusInstalled(),
            AntivirusEnabled = IsAntivirusEnabled(),
            AntivirusName = GetAntivirusName(),
            FirewallEnabled = IsFirewallEnabled(),
            EncryptionEnabled = IsEncryptionEnabled()
        };

        return info;
    }

    private string GetWindowsBuild()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
            return key?.GetValue("DisplayVersion")?.ToString() ?? 
                   key?.GetValue("ReleaseId")?.ToString() ?? 
                   Environment.OSVersion.Version.ToString();
        }
        catch
        {
            return Environment.OSVersion.Version.ToString();
        }
    }

    private string GetCpuModel()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor");
            foreach (ManagementObject obj in searcher.Get())
            {
                return obj["Name"]?.ToString() ?? "Unknown";
            }
        }
        catch { }
        return "Unknown";
    }

    private int GetCpuThreads()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT NumberOfLogicalProcessors FROM Win32_Processor");
            foreach (ManagementObject obj in searcher.Get())
            {
                if (obj["NumberOfLogicalProcessors"] != null)
                {
                    return Convert.ToInt32(obj["NumberOfLogicalProcessors"]);
                }
            }
        }
        catch { }
        return Environment.ProcessorCount;
    }

    private long GetTotalMemory()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT TotalPhysicalMemory FROM Win32_ComputerSystem");
            foreach (ManagementObject obj in searcher.Get())
            {
                if (obj["TotalPhysicalMemory"] != null)
                {
                    return Convert.ToInt64(obj["TotalPhysicalMemory"]);
                }
            }
        }
        catch { }
        return 0;
    }

    private long GetUsedMemory()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem");
            foreach (ManagementObject obj in searcher.Get())
            {
                var total = Convert.ToInt64(obj["TotalVisibleMemorySize"]) * 1024;
                var free = Convert.ToInt64(obj["FreePhysicalMemory"]) * 1024;
                return total - free;
            }
        }
        catch { }
        return 0;
    }

    private long GetTotalStorage()
    {
        var drives = DriveInfo.GetDrives();
        return drives.Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
                     .Sum(d => d.TotalSize);
    }

    private long GetUsedStorage()
    {
        var drives = DriveInfo.GetDrives();
        return drives.Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
                     .Sum(d => d.TotalSize - d.AvailableFreeSpace);
    }

    private List<StorageDrive> GetStorageDrives()
    {
        var drives = new List<StorageDrive>();
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
        {
            drives.Add(new StorageDrive
            {
                Drive = drive.Name,
                Label = drive.VolumeLabel,
                FileSystem = drive.DriveFormat,
                Total = drive.TotalSize,
                Used = drive.TotalSize - drive.AvailableFreeSpace,
                Free = drive.AvailableFreeSpace
            });
        }
        return drives;
    }

    private string GetIpAddress()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up &&
                             nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
                .Where(addr => addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                .Select(addr => addr.Address.ToString())
                .FirstOrDefault();

            return interfaces ?? "Unknown";
        }
        catch { }
        return "Unknown";
    }

    private async Task<string?> GetPublicIpAddressAsync()
    {
        try
        {
            // Usar cache para evitar muitas requisições
            if (_cachedPublicIP != null && DateTime.Now - _lastPublicIPCheck < _publicIPCacheTimeout)
            {
                return _cachedPublicIP;
            }

            using var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(5);

            // Tentar múltiplas APIs como fallback
            var apis = new[]
            {
                "https://api.ipify.org",
                "https://icanhazip.com",
                "https://ifconfig.me/ip",
                "https://api.ip.sb/ip"
            };

            foreach (var api in apis)
            {
                try
                {
                    var response = await httpClient.GetStringAsync(api);
                    var publicIP = response.Trim();
                    
                    // Validar se é um IP válido
                    if (System.Net.IPAddress.TryParse(publicIP, out _))
                    {
                        _cachedPublicIP = publicIP;
                        _lastPublicIPCheck = DateTime.Now;
                        return publicIP;
                    }
                }
                catch
                {
                    // Tentar próxima API
                    continue;
                }
            }
        }
        catch
        {
            // Se falhar, retornar null para usar IP privado como fallback
        }

        return null;
    }

    private string GetMacAddress()
    {
        try
        {
            var mac = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up &&
                             nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(nic => nic.GetPhysicalAddress().ToString())
                .FirstOrDefault();

            return mac ?? "Unknown";
        }
        catch { }
        return "Unknown";
    }

    private string GetNetworkType()
    {
        try
        {
            // Primeiro, verificar se há SSID Wi-Fi disponível (indica conexão Wi-Fi ativa)
            var wifiSSID = GetWifiSSID();
            if (!string.IsNullOrEmpty(wifiSSID))
            {
                return "Wi-Fi";
            }

            // Se não há SSID, verificar interfaces de rede
            // Priorizar Wi-Fi sobre Ethernet quando ambas estiverem ativas
            var allInterfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic => nic.OperationalStatus == OperationalStatus.Up &&
                             nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .ToList();

            // Procurar primeiro por interface Wi-Fi
            var wifiInterface = allInterfaces
                .FirstOrDefault(nic => nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211);
            
            if (wifiInterface != null)
            {
                    return "Wi-Fi";
            }

            // Se não há Wi-Fi, procurar por Ethernet
            var ethernetInterface = allInterfaces
                .FirstOrDefault(nic => nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet);
            
            if (ethernetInterface != null)
            {
                    return "Ethernet";
            }

            // Se não encontrou Wi-Fi nem Ethernet, retornar o tipo da primeira interface
            var firstInterface = allInterfaces.FirstOrDefault();
            if (firstInterface != null)
            {
                return firstInterface.NetworkInterfaceType.ToString();
            }
        }
        catch { }
        return "Unknown";
    }

    private string? GetWifiSSID()
    {
        try
        {
            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "wlan show interfaces",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            var lines = output.Split('\n');
            foreach (var line in lines)
            {
                if (line.Contains("SSID") && !line.Contains("BSSID"))
                {
                    var parts = line.Split(':');
                    if (parts.Length > 1)
                    {
                        return parts[1].Trim();
                    }
                }
            }
        }
        catch { }
        return null;
    }

    private bool IsWifiEnabled()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Any(nic => nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 &&
                           nic.OperationalStatus == OperationalStatus.Up);
            return interfaces;
        }
        catch { }
        return false;
    }

    private bool IsBluetoothEnabled()
    {
        // Verificar se há adaptadores Bluetooth disponíveis
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_PnPEntity WHERE Name LIKE '%Bluetooth%'");
            return searcher.Get().Count > 0;
        }
        catch { }
        return false;
    }

    private List<InstalledProgram> GetInstalledPrograms()
    {
        var programs = new List<InstalledProgram>();

        try
        {
            // Programas de 64 bits
            using var key64 = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (key64 != null)
            {
                foreach (var subKeyName in key64.GetSubKeyNames())
                {
                    using var subKey = key64.OpenSubKey(subKeyName);
                    if (subKey != null)
                    {
                        var name = subKey.GetValue("DisplayName")?.ToString();
                        if (!string.IsNullOrEmpty(name))
                        {
                            programs.Add(new InstalledProgram
                            {
                                Name = name,
                                Version = subKey.GetValue("DisplayVersion")?.ToString(),
                                Publisher = subKey.GetValue("Publisher")?.ToString(),
                                InstallDate = ParseInstallDate(subKey.GetValue("InstallDate")?.ToString()),
                                InstallLocation = subKey.GetValue("InstallLocation")?.ToString(),
                                Size = subKey.GetValue("EstimatedSize") != null ? 
                                       Convert.ToInt64(subKey.GetValue("EstimatedSize")) * 1024 : null
                            });
                        }
                    }
                }
            }

            // Programas de 32 bits (em sistemas 64 bits)
            if (Environment.Is64BitOperatingSystem)
            {
                using var key32 = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall");
                if (key32 != null)
                {
                    foreach (var subKeyName in key32.GetSubKeyNames())
                    {
                        using var subKey = key32.OpenSubKey(subKeyName);
                        if (subKey != null)
                        {
                            var name = subKey.GetValue("DisplayName")?.ToString();
                            if (!string.IsNullOrEmpty(name) && !programs.Any(p => p.Name == name))
                            {
                                programs.Add(new InstalledProgram
                                {
                                    Name = name,
                                    Version = subKey.GetValue("DisplayVersion")?.ToString(),
                                    Publisher = subKey.GetValue("Publisher")?.ToString(),
                                    InstallDate = ParseInstallDate(subKey.GetValue("InstallDate")?.ToString()),
                                    InstallLocation = subKey.GetValue("InstallLocation")?.ToString(),
                                    Size = subKey.GetValue("EstimatedSize") != null ? 
                                           Convert.ToInt64(subKey.GetValue("EstimatedSize")) * 1024 : null
                                });
                            }
                        }
                    }
                }
            }
        }
        catch { }

        return programs.OrderBy(p => p.Name).ToList();
    }

    private long? ParseInstallDate(string? dateStr)
    {
        if (string.IsNullOrEmpty(dateStr) || dateStr.Length != 8)
            return null;

        try
        {
            var year = int.Parse(dateStr.Substring(0, 4));
            var month = int.Parse(dateStr.Substring(4, 2));
            var day = int.Parse(dateStr.Substring(6, 2));
            var date = new DateTime(year, month, day);
            return ((DateTimeOffset)date).ToUnixTimeMilliseconds();
        }
        catch
        {
            return null;
        }
    }

    private bool IsAntivirusInstalled()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\SecurityCenter2", 
                "SELECT * FROM AntiVirusProduct");
            return searcher.Get().Count > 0;
        }
        catch
        {
            // Tentar método alternativo
            try
            {
                using var searcher = new ManagementObjectSearcher(@"root\SecurityCenter", 
                    "SELECT * FROM AntiVirusProduct");
                return searcher.Get().Count > 0;
            }
            catch { }
        }
        return false;
    }

    private bool IsAntivirusEnabled()
    {
        return IsAntivirusInstalled(); // Simplificado
    }

    private string? GetAntivirusName()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(@"root\SecurityCenter2", 
                "SELECT displayName FROM AntiVirusProduct");
            foreach (ManagementObject obj in searcher.Get())
            {
                return obj["displayName"]?.ToString() ?? "Unknown";
            }
        }
        catch
        {
            try
            {
                using var searcher = new ManagementObjectSearcher(@"root\SecurityCenter", 
                    "SELECT displayName FROM AntiVirusProduct");
                foreach (ManagementObject obj in searcher.Get())
                {
                    return obj["displayName"]?.ToString() ?? "Unknown";
                }
            }
            catch { }
        }
        return null;
    }

    private bool IsFirewallEnabled()
    {
        try
        {
            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "advfirewall show allprofiles state",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            return output.Contains("ON");
        }
        catch { }
        return false;
    }

    private bool IsEncryptionEnabled()
    {
        // Verificar BitLocker
        try
        {
            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "manage-bde",
                    Arguments = "-status",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            return output.Contains("Encryption Percentage:") && 
                   !output.Contains("Encryption Percentage: 0%");
        }
        catch { }
        return false;
    }
}

