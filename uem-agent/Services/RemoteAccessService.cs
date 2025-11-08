using System.Diagnostics;
using System.Management;
using UEMAgent.Models;
using System.IO;

namespace UEMAgent.Services;

public class RemoteAccessService
{
    public async Task<bool> EnableRDPAsync()
    {
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "reg",
                    Arguments = "add \"HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\" /v fDenyTSConnections /t REG_DWORD /d 0 /f",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true,
                    Verb = "runas"
                }
            };
            process.Start();
            await process.WaitForExitAsync();
            
            // Habilitar firewall
            var firewallProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "advfirewall firewall set rule group=\"remote desktop\" new enable=Yes",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    Verb = "runas"
                }
            };
            firewallProcess.Start();
            await firewallProcess.WaitForExitAsync();
            
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao habilitar RDP: {ex.Message}");
            return false;
        }
    }

    public Task<bool> InstallAnyDeskAsync()
    {
        // Verificar se AnyDesk já está instalado
        if (IsAnyDeskInstalled())
        {
            return Task.FromResult(true);
        }

        // Aqui você pode implementar a instalação automática do AnyDesk
        // ou fornecer instruções para o usuário
        Console.WriteLine("⚠️ AnyDesk não está instalado. Instale manualmente ou configure o caminho de instalação.");
        return Task.FromResult(false);
    }

    public bool IsAnyDeskInstalled()
    {
        try
        {
            var anyDeskPath = @"C:\Program Files (x86)\AnyDesk\AnyDesk.exe";
            if (File.Exists(anyDeskPath))
                return true;

            anyDeskPath = @"C:\Program Files\AnyDesk\AnyDesk.exe";
            return File.Exists(anyDeskPath);
        }
        catch
        {
            return false;
        }
    }

    public string? GetAnyDeskId()
    {
        if (!IsAnyDeskInstalled())
            return null;

        try
        {
            var anyDeskPath = @"C:\Program Files (x86)\AnyDesk\AnyDesk.exe";
            if (!File.Exists(anyDeskPath))
            {
                anyDeskPath = @"C:\Program Files\AnyDesk\AnyDesk.exe";
                if (!File.Exists(anyDeskPath))
                    return null;
            }

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = anyDeskPath,
                    Arguments = "--get-id",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            
            return output.Trim();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao obter ID do AnyDesk: {ex.Message}");
            return null;
        }
    }
}

