using System.Diagnostics;
using System.Runtime.InteropServices;

namespace UEMAgent.Services;

public class RemoteDesktopService : IDisposable
{
    private readonly ScreenCaptureService _screenCapture;
    private bool _isSessionActive = false;
    private string? _currentSessionId;

    public RemoteDesktopService(ScreenCaptureService screenCapture)
    {
        _screenCapture = screenCapture;
        _screenCapture.FrameCaptured += OnFrameCaptured;
    }

    public event EventHandler<byte[]>? FrameCaptured;
    public event EventHandler<string>? SessionStarted;
    public event EventHandler<string>? SessionStopped;

    public bool StartSession(string sessionId)
    {
        if (_isSessionActive)
        {
            return false;
        }

        _currentSessionId = sessionId;
        _isSessionActive = true;
        
        // Obter tamanho real do monitor principal para manter proporção
        var screenSize = _screenCapture.GetScreenSize();
        var screenWidth = screenSize.Width;
        var screenHeight = screenSize.Height;
        
        // Calcular resolução mantendo proporção (máximo 1920x1080 para performance)
        int targetWidth = screenWidth;
        int targetHeight = screenHeight;
        
        if (screenWidth > 1920 || screenHeight > 1080)
        {
            var scale = Math.Min(1920.0 / screenWidth, 1080.0 / screenHeight);
            targetWidth = (int)(screenWidth * scale);
            targetHeight = (int)(screenHeight * scale);
        }
        
        // Iniciar captura com 10 FPS mantendo proporção da tela
        _screenCapture.StartCapture(fps: 10, width: targetWidth, height: targetHeight);
        
        SessionStarted?.Invoke(this, sessionId);
        
        return true;
    }

    public void StopSession()
    {
        if (!_isSessionActive)
            return;

        _isSessionActive = false;
        _screenCapture.StopCapture();
        
        var sessionId = _currentSessionId ?? "unknown";
        _currentSessionId = null;
        
        SessionStopped?.Invoke(this, sessionId);
    }

    public bool IsSessionActive => _isSessionActive;
    public string? CurrentSessionId => _currentSessionId;

    private void OnFrameCaptured(object? sender, byte[] frame)
    {
        if (_isSessionActive)
        {
            FrameCaptured?.Invoke(this, frame);
        }
    }

    // Controle remoto - Mouse
    public void SendMouseMove(int x, int y)
    {
        SetCursorPos(x, y);
    }

    public void SendMouseClick(int x, int y, MouseButton button)
    {
        SetCursorPos(x, y);
        
        uint mouseEvent = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN | MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN | MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP
        };
        
        mouse_event(mouseEvent, 0, 0, 0, 0);
    }

    public void SendMouseDown(int x, int y, MouseButton button)
    {
        SetCursorPos(x, y);
        
        uint mouseEvent = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };
        
        mouse_event(mouseEvent, 0, 0, 0, 0);
    }

    public void SendMouseUp(int x, int y, MouseButton button)
    {
        SetCursorPos(x, y);
        
        uint mouseEvent = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };
        
        mouse_event(mouseEvent, 0, 0, 0, 0);
    }

    public void SendMouseWheel(int delta)
    {
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
    }

    // Controle remoto - Teclado
    public void SendKeyPress(ushort virtualKey)
    {
        keybd_event((byte)virtualKey, 0, 0, 0);
        keybd_event((byte)virtualKey, 0, KEYEVENTF_KEYUP, 0);
    }

    public void SendKeyDown(ushort virtualKey)
    {
        keybd_event((byte)virtualKey, 0, 0, 0);
    }

    public void SendKeyUp(ushort virtualKey)
    {
        keybd_event((byte)virtualKey, 0, KEYEVENTF_KEYUP, 0);
    }

    public void SendText(string text)
    {
        foreach (var c in text)
        {
            var vk = VkKeyScan(c);
            if (vk != -1)
            {
                var virtualKey = (ushort)(vk & 0xFF);
                var shift = (vk & 0x100) != 0;
                var ctrl = (vk & 0x200) != 0;
                var alt = (vk & 0x400) != 0;

                if (shift) SendKeyDown(VK_SHIFT);
                if (ctrl) SendKeyDown(VK_CONTROL);
                if (alt) SendKeyDown(VK_MENU);

                SendKeyPress(virtualKey);

                if (alt) SendKeyUp(VK_MENU);
                if (ctrl) SendKeyUp(VK_CONTROL);
                if (shift) SendKeyUp(VK_SHIFT);
            }
            else
            {
                // Para caracteres especiais, usar SendInput
                SendInputChar(c);
            }
        }
    }

    private void SendInputChar(char c)
    {
        var inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = 0;
        inputs[0].ki.wScan = c;
        inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
        inputs[0].ki.time = 0;
        inputs[0].ki.dwExtraInfo = IntPtr.Zero;

        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = 0;
        inputs[1].ki.wScan = c;
        inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        inputs[1].ki.time = 0;
        inputs[1].ki.dwExtraInfo = IntPtr.Zero;

        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    // P/Invoke declarations
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern short VkKeyScan(char ch);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;

    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    private const ushort VK_SHIFT = 0x10;
    private const ushort VK_CONTROL = 0x11;
    private const ushort VK_MENU = 0x12; // ALT

    private const int INPUT_KEYBOARD = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public int type;
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    public enum MouseButton
    {
        Left,
        Right,
        Middle
    }

    public void Dispose()
    {
        StopSession();
        _screenCapture.FrameCaptured -= OnFrameCaptured;
    }
}

