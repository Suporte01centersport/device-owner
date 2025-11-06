namespace UEMAgent.Models;

public class RemoteInputEvent
{
    public string Type { get; set; } = string.Empty; // mouse_move, mouse_click, mouse_down, mouse_up, key_press, scroll
    public int? X { get; set; }
    public int? Y { get; set; }
    public string? Button { get; set; } // left, right, middle
    public string? Key { get; set; }
    public int? ScrollDelta { get; set; }
    public Dictionary<string, object>? Params { get; set; }
}

