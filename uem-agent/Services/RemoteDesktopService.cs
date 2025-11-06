using System.Diagnostics;
using System.Runtime.InteropServices;

namespace UEMAgent.Services;

public class RemoteDesktopService : IDisposable
{
    private readonly ScreenCaptureService _screenCapture;
    private bool _isSessionActive = false;
    private string? _currentSessionId;
    // Armazenar última posição do mouse para evitar movimentos desnecessários
    private int _lastMouseX = -1;
    private int _lastMouseY = -1;

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
        // Aumentar para 2560x1440 se necessário para melhor qualidade em telas grandes
        int maxWidth = 1920;
        int maxHeight = 1080;
        
        int targetWidth = screenWidth;
        int targetHeight = screenHeight;
        
        if (screenWidth > maxWidth || screenHeight > maxHeight)
        {
            var scale = Math.Min((double)maxWidth / screenWidth, (double)maxHeight / screenHeight);
            targetWidth = (int)(screenWidth * scale);
            targetHeight = (int)(screenHeight * scale);
            
            // Garantir que seja múltiplo de 2 (melhor para compressão)
            targetWidth = (targetWidth / 2) * 2;
            targetHeight = (targetHeight / 2) * 2;
        }
        
        // Iniciar captura com 15 FPS para melhor fluidez (aumentado de 10 para 15)
        _screenCapture.StartCapture(fps: 15, width: targetWidth, height: targetHeight);
        
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

    // Controle remoto - Mouse (usando SendInput)
    public void SendMouseMove(int x, int y)
    {
        // Usar SetCursorPos para movimento (mais simples e direto)
        // SendInput com movimento absoluto requer conversão complexa
        var result = SetCursorPos(x, y);
        if (result)
        {
            _lastMouseX = x;
            _lastMouseY = y;
        }
        else
        {
            var error = Marshal.GetLastWin32Error();
            Console.WriteLine($"⚠️ Erro ao mover mouse para ({x}, {y}): {error}");
        }
    }
    
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    public void SendMouseClick(int x, int y, MouseButton button)
    {
        // Mover cursor
        SendMouseMove(x, y);
        
        // Enviar clique (down + up)
        var inputs = new INPUT[2];
        
        // Down
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dx = 0;
        inputs[0].mi.dy = 0;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;
        
        // Up
        inputs[1].type = INPUT_MOUSE;
        inputs[1].mi.dx = 0;
        inputs[1].mi.dy = 0;
        inputs[1].mi.mouseData = 0;
        inputs[1].mi.dwFlags = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };
        inputs[1].mi.time = 0;
        inputs[1].mi.dwExtraInfo = IntPtr.Zero;
        
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public void SendMouseDown(int x, int y, MouseButton button)
    {
        // Verificar se há uma sessão ativa
        if (!_isSessionActive)
        {
            Console.WriteLine($"⚠️ Tentativa de enviar mouse down sem sessão ativa");
            return;
        }
        
        // Mover cursor apenas se necessário (evitar movimentos desnecessários)
        if (_lastMouseX != x || _lastMouseY != y)
        {
            SendMouseMove(x, y);
            _lastMouseX = x;
            _lastMouseY = y;
            // Pequeno delay para garantir que o movimento foi processado
            System.Threading.Thread.Sleep(1);
        }
        
        // Enviar down
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dx = 0;
        inputs[0].mi.dy = 0;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;
        
        var result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (result == 0)
        {
            var error = Marshal.GetLastWin32Error();
            Console.WriteLine($"⚠️ Erro ao enviar mouse down: código {error} (0x{error:X})");
            if (error == 5) // ERROR_ACCESS_DENIED
            {
                Console.WriteLine($"   ⚠️ ACESSO NEGADO: O agente precisa rodar com privilégios de administrador!");
            }
        }
    }

    public void SendMouseUp(int x, int y, MouseButton button)
    {
        // Verificar se há uma sessão ativa
        if (!_isSessionActive)
        {
            Console.WriteLine($"⚠️ Tentativa de enviar mouse up sem sessão ativa");
            return;
        }
        
        // Mover cursor apenas se necessário (evitar movimentos desnecessários)
        if (_lastMouseX != x || _lastMouseY != y)
        {
            SendMouseMove(x, y);
            _lastMouseX = x;
            _lastMouseY = y;
            // Pequeno delay para garantir que o movimento foi processado
            System.Threading.Thread.Sleep(1);
        }
        
        // Enviar up
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dx = 0;
        inputs[0].mi.dy = 0;
        inputs[0].mi.mouseData = 0;
        inputs[0].mi.dwFlags = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;
        
        var result = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (result == 0)
        {
            var error = Marshal.GetLastWin32Error();
            Console.WriteLine($"⚠️ Erro ao enviar mouse up: código {error} (0x{error:X})");
            if (error == 5) // ERROR_ACCESS_DENIED
            {
                Console.WriteLine($"   ⚠️ ACESSO NEGADO: O agente precisa rodar com privilégios de administrador!");
            }
        }
    }

    public void SendMouseWheel(int delta)
    {
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].mi.dx = 0;
        inputs[0].mi.dy = 0;
        inputs[0].mi.mouseData = (uint)delta;
        inputs[0].mi.dwFlags = MOUSEEVENTF_WHEEL;
        inputs[0].mi.time = 0;
        inputs[0].mi.dwExtraInfo = IntPtr.Zero;
        
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    // Controle remoto - Teclado (usando SendInput)
    public void SendKeyPress(ushort virtualKey)
    {
        var inputs = new INPUT[2];
        
        // Key down
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = virtualKey;
        inputs[0].ki.wScan = 0;
        inputs[0].ki.dwFlags = 0;
        inputs[0].ki.time = 0;
        inputs[0].ki.dwExtraInfo = IntPtr.Zero;
        
        // Key up
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = virtualKey;
        inputs[1].ki.wScan = 0;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        inputs[1].ki.time = 0;
        inputs[1].ki.dwExtraInfo = IntPtr.Zero;
        
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public void SendKeyDown(ushort virtualKey)
    {
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = virtualKey;
        inputs[0].ki.wScan = 0;
        inputs[0].ki.dwFlags = 0;
        inputs[0].ki.time = 0;
        inputs[0].ki.dwExtraInfo = IntPtr.Zero;
        
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public void SendKeyUp(ushort virtualKey)
    {
        var inputs = new INPUT[1];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = virtualKey;
        inputs[0].ki.wScan = 0;
        inputs[0].ki.dwFlags = KEYEVENTF_KEYUP;
        inputs[0].ki.time = 0;
        inputs[0].ki.dwExtraInfo = IntPtr.Zero;
        
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
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
    private static extern short VkKeyScan(char ch);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
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

    private const int INPUT_MOUSE = 0;
    private const int INPUT_KEYBOARD = 1;

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUT
    {
        [FieldOffset(0)]
        public int type;
        
        [FieldOffset(4)]
        public MOUSEINPUT mi;
        
        [FieldOffset(4)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
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

