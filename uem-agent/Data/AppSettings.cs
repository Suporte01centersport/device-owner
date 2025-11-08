namespace UEMAgent.Data;

public class AppSettings
{
    public string ServerUrl { get; set; } = "ws://192.168.2.100:3002";
    public string ComputerId { get; set; } = "";
    public int UpdateInterval { get; set; } = 30000;
    public int LocationUpdateInterval { get; set; } = 300000;
    public int HeartbeatInterval { get; set; } = 10000;
    public int ReconnectDelay { get; set; } = 5000;
    public int MaxReconnectAttempts { get; set; } = 10;
    public string? AdminPassword { get; set; }
}


