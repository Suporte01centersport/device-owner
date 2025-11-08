using System;
using System.Net.NetworkInformation;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;

namespace UEMAgent.Services;

public class ConnectivityMonitorService : IHostedService, IDisposable
{
    private readonly WebSocketService _webSocketService;
    private readonly ILogger<ConnectivityMonitorService> _logger;
    private bool _disposed;
    private readonly object _syncRoot = new();
    private DateTime _lastTriggerUtc = DateTime.MinValue;
    private readonly TimeSpan _debounceInterval = TimeSpan.FromSeconds(10);

    public ConnectivityMonitorService(WebSocketService webSocketService, ILogger<ConnectivityMonitorService> logger)
    {
        _webSocketService = webSocketService;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        NetworkChange.NetworkAvailabilityChanged += OnNetworkAvailabilityChanged;
        NetworkChange.NetworkAddressChanged += OnNetworkAddressChanged;

        try
        {
            SystemEvents.PowerModeChanged += OnPowerModeChanged;
            SystemEvents.SessionSwitch += OnSessionSwitch;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Não foi possível registrar eventos de sistema. Alguns cenários de reconexão podem não ser detectados.");
        }

        _logger.LogInformation("Monitor de conectividade iniciado.");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
        NetworkChange.NetworkAddressChanged -= OnNetworkAddressChanged;

        try
        {
            SystemEvents.PowerModeChanged -= OnPowerModeChanged;
            SystemEvents.SessionSwitch -= OnSessionSwitch;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Erro ao remover handlers de eventos do sistema.");
        }

        _logger.LogInformation("Monitor de conectividade finalizado.");
        return Task.CompletedTask;
    }

    private void RequestReconnect(string reason)
    {
        lock (_syncRoot)
        {
            var now = DateTime.UtcNow;
            if (now - _lastTriggerUtc < _debounceInterval)
            {
                _logger.LogDebug("Reconexão ignorada (debounce). Motivo: {Reason}", reason);
                return;
            }
            _lastTriggerUtc = now;
        }

        _logger.LogInformation("Solicitando reconexão do agente. Motivo: {Reason}", reason);
        _webSocketService.TriggerReconnect(reason);
    }

    private void OnNetworkAvailabilityChanged(object? sender, NetworkAvailabilityEventArgs e)
    {
        var reason = e.IsAvailable ? "Rede disponível" : "Rede indisponível";
        RequestReconnect(reason);
    }

    private void OnNetworkAddressChanged(object? sender, EventArgs e)
    {
        RequestReconnect("Alteração de endereço de rede");
    }

    private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode is PowerModes.Resume or PowerModes.StatusChange)
        {
            RequestReconnect($"PowerMode: {e.Mode}");
        }
    }

    private void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        if (e.Reason is SessionSwitchReason.SessionUnlock or SessionSwitchReason.RemoteConnect or SessionSwitchReason.RemoteDisconnect)
        {
            RequestReconnect($"SessionSwitch: {e.Reason}");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
        NetworkChange.NetworkAddressChanged -= OnNetworkAddressChanged;

        try
        {
            SystemEvents.PowerModeChanged -= OnPowerModeChanged;
            SystemEvents.SessionSwitch -= OnSessionSwitch;
        }
        catch
        {
            // Ignorar erros durante dispose
        }
    }
}


