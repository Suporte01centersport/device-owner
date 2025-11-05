using System.Net.Http;
using System.Text.Json;
using UEMAgent.Models;

namespace UEMAgent.Services;

public class LocationService
{
    private readonly HttpClient _httpClient;

    public LocationService()
    {
        _httpClient = new HttpClient();
    }

    public async Task<LocationInfo?> GetLocationAsync()
    {
        try
        {
            // Tentar obter localização via IP
            var response = await _httpClient.GetStringAsync("http://ip-api.com/json/");
            var data = JsonSerializer.Deserialize<JsonElement>(response);
            
            if (data.TryGetProperty("status", out var status) && status.GetString() == "success")
            {
                return new LocationInfo
                {
                    Latitude = data.TryGetProperty("lat", out var lat) ? lat.GetDouble() : null,
                    Longitude = data.TryGetProperty("lon", out var lon) ? lon.GetDouble() : null,
                    Accuracy = 10000, // ~10km para geolocalização por IP
                    Address = data.TryGetProperty("city", out var city) ? city.GetString() : null
                };
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Erro ao obter localização: {ex.Message}");
        }

        return null;
    }
}

public class LocationInfo
{
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double Accuracy { get; set; }
    public string? Address { get; set; }
}


