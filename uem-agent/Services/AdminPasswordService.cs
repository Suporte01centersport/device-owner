using System;
using System.Threading;
using Microsoft.Extensions.Options;
using UEMAgent.Data;

namespace UEMAgent.Services;

/// <summary>
/// Serviço responsável por armazenar, sincronizar e validar a senha de administrador
/// configurada via plataforma UEM.
/// </summary>
public class AdminPasswordService
{
    private readonly object _syncRoot = new();
    private string? _password;
    private DateTime _lastUpdatedUtc;

    public event EventHandler<string?>? PasswordChanged;

    public AdminPasswordService(IOptions<AppSettings> options)
    {
        var initialPassword = options.Value.AdminPassword;
        if (!string.IsNullOrWhiteSpace(initialPassword))
        {
            SetPasswordInternal(initialPassword, raiseEvent: false);
        }
    }

    /// <summary>
    /// Obtém a senha atual armazenada (texto puro).
    /// </summary>
    public string? GetPassword()
    {
        lock (_syncRoot)
        {
            return _password;
        }
    }

    /// <summary>
    /// Atualiza a senha armazenada.
    /// </summary>
    public void SetPassword(string? password)
    {
        SetPasswordInternal(password, raiseEvent: true);
    }

    /// <summary>
    /// Indica se uma senha não vazia está configurada.
    /// </summary>
    public bool HasPassword
    {
        get
        {
            lock (_syncRoot)
            {
                return !string.IsNullOrEmpty(_password);
            }
        }
    }

    /// <summary>
    /// Data de atualização da senha (UTC).
    /// </summary>
    public DateTime LastUpdatedUtc
    {
        get
        {
            lock (_syncRoot)
            {
                return _lastUpdatedUtc;
            }
        }
    }

    /// <summary>
    /// Valida a senha informada pelo usuário.
    /// </summary>
    public bool ValidatePassword(string? password)
    {
        lock (_syncRoot)
        {
            var current = _password ?? string.Empty;
            var attempt = password ?? string.Empty;
            return string.Equals(current, attempt, StringComparison.Ordinal);
        }
    }

    private void SetPasswordInternal(string? password, bool raiseEvent)
    {
        string? normalized = string.IsNullOrEmpty(password) ? null : password;
        string? previous;
        bool changed;

        lock (_syncRoot)
        {
            previous = _password;
            changed = !string.Equals(previous, normalized, StringComparison.Ordinal);
            if (!changed)
            {
                return;
            }

            _password = normalized;
            _lastUpdatedUtc = DateTime.UtcNow;
        }

        if (raiseEvent && changed)
        {
            PasswordChanged?.Invoke(this, normalized);
        }
    }
}


