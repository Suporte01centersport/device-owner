using System.Runtime.InteropServices;
using System.Drawing;

namespace UEMAgent.Services;

public class InputSimulationService
{
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    // Constantes para mouse_event
    private const uint MOUSEEVENTF_LEFTDOWN = 0x02;
    private const uint MOUSEEVENTF_LEFTUP = 0x04;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x08;
    private const uint MOUSEEVENTF_RIGHTUP = 0x10;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x20;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x40;
    private const uint MOUSEEVENTF_WHEEL = 0x800;
    private const uint MOUSEEVENTF_MOVE = 0x0001;

    // Constantes para keybd_event
    private const uint KEYEVENTF_KEYUP = 0x0002;

    public void MoveMouse(int x, int y)
    {
        SetCursorPos(x, y);
    }

    public void ClickMouse(MouseButton button)
    {
        uint downFlag = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };

        uint upFlag = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };

        mouse_event(downFlag, 0, 0, 0, 0);
        Thread.Sleep(10); // Pequeno delay
        mouse_event(upFlag, 0, 0, 0, 0);
    }

    public void MouseDown(MouseButton button)
    {
        uint flag = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTDOWN,
            MouseButton.Right => MOUSEEVENTF_RIGHTDOWN,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEDOWN,
            _ => MOUSEEVENTF_LEFTDOWN
        };

        mouse_event(flag, 0, 0, 0, 0);
    }

    public void MouseUp(MouseButton button)
    {
        uint flag = button switch
        {
            MouseButton.Left => MOUSEEVENTF_LEFTUP,
            MouseButton.Right => MOUSEEVENTF_RIGHTUP,
            MouseButton.Middle => MOUSEEVENTF_MIDDLEUP,
            _ => MOUSEEVENTF_LEFTUP
        };

        mouse_event(flag, 0, 0, 0, 0);
    }

    public void ScrollMouse(int delta)
    {
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
    }

    public void SendKey(byte virtualKey, bool keyUp = false)
    {
        uint flags = keyUp ? KEYEVENTF_KEYUP : 0;
        keybd_event(virtualKey, 0, flags, 0);
    }

    public void SendText(string text)
    {
        foreach (char c in text)
        {
            SendChar(c);
        }
    }

    private void SendChar(char c)
    {
        // Mapeamento básico de caracteres para códigos virtuais
        // Para uma implementação completa, seria necessário usar SendInput
        if (char.IsLetter(c))
        {
            byte vk = (byte)(char.ToUpper(c));
            SendKey(vk);
            Thread.Sleep(10);
            SendKey(vk, true);
        }
        else if (char.IsDigit(c))
        {
            byte vk = (byte)(c);
            SendKey(vk);
            Thread.Sleep(10);
            SendKey(vk, true);
        }
        // Espaço
        else if (c == ' ')
        {
            SendKey(0x20); // VK_SPACE
            Thread.Sleep(10);
            SendKey(0x20, true);
        }
        // Enter
        else if (c == '\n' || c == '\r')
        {
            SendKey(0x0D); // VK_RETURN
            Thread.Sleep(10);
            SendKey(0x0D, true);
        }
    }
}

public enum MouseButton
{
    Left,
    Right,
    Middle
}

