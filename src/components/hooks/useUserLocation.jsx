import { useState, useEffect } from 'react';

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    loadUserLocation();
  }, []);

  const loadUserLocation = async () => {
    // Check localStorage first
    const savedLocation = localStorage.getItem('userLocation');
    if (savedLocation) {
      setUserLocation(JSON.parse(savedLocation));
      return;
    }

    // Default to Toronto if geolocation unavailable or fails
    const defaultLocation = {
      lat: 43.6532,
      lng: -79.3832,
      address: 'Toronto, Ontario'
    };

    // Try browser geolocation
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get address
          try {
            const apiKey = Deno?.env?.get('GOOGLE_MAPS_API_KEY');
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
            );
            const data = await response.json();
            
            const location = {
              lat: latitude,
              lng: longitude,
              address: data.results[0]?.formatted_address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            };
            
            setUserLocation(location);
            localStorage.setItem('userLocation', JSON.stringify(location));
          } catch (error) {
            console.error('Geocoding failed:', error);
            const location = { lat: latitude, lng: longitude, address: null };
            setUserLocation(location);
            localStorage.setItem('userLocation', JSON.stringify(location));
          }
        },
        (error) => {
          console.log('Geolocation denied or failed:', error);
          // Fall back to Toronto
          setUserLocation(defaultLocation);
          localStorage.setItem('userLocation', JSON.stringify(defaultLocation));
        }
      );
    } else {
      // Fall back to Toronto if geolocation not available
      setUserLocation(defaultLocation);
      localStorage.setItem('userLocation', JSON.stringify(defaultLocation));
    }
  };

  return userLocation;
}