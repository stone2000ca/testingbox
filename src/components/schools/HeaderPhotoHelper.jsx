import { useState } from 'react';

// Helper component to display header photo with Clearbit fallback
export function isClearbitUrl(url) {
  if (!url) return false;
  return url.includes('clearbit.com') || url.includes('logo.clearbit');
}

export function HeaderPhotoDisplay({ headerPhotoUrl, heroImage, schoolName, height = 'h-96' }) {
  const [showFallback, setShowFallback] = useState(false);
  
  const isHeaderPhotoClearbit = isClearbitUrl(headerPhotoUrl);
  const isHeroImageClearbit = isClearbitUrl(heroImage);
  const hasValidHeaderPhoto = headerPhotoUrl && !isHeaderPhotoClearbit;
  const hasValidHeroImage = heroImage && !isHeroImageClearbit;

  // BUG FIX #7: Check both headerPhotoUrl and heroImage for Clearbit
  if (hasValidHeaderPhoto && !showFallback) {
    return (
      <img 
        src={headerPhotoUrl} 
        alt={schoolName}
        className={`w-full ${height} object-cover`}
        onError={() => setShowFallback(true)}
      />
    );
  }

  if (hasValidHeroImage && !showFallback) {
    return (
      <img 
        src={heroImage} 
        alt={schoolName}
        className={`w-full ${height} object-cover`}
        onError={() => setShowFallback(true)}
      />
    );
  }

  // Default gradient with school name
  return (
    <div className={`w-full ${height} flex items-center justify-center bg-gradient-to-br from-teal-600 to-blue-700 relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-white rounded-full mix-blend-screen" />
      </div>
      <div className="relative z-10 text-center text-white px-6">
        <div className="text-6xl font-bold opacity-30 mb-4">{schoolName.charAt(0).toUpperCase()}</div>
        <p className="text-xl font-light">{schoolName}</p>
      </div>
    </div>
  );
}

export function LogoDisplay({ logoUrl, schoolName, schoolWebsite, size = 'h-12 w-12' }) {
  const [imageError, setImageError] = useState(false);
  
  // Try logoUrl first
  if (logoUrl && !imageError) {
    return (
      <img 
        src={logoUrl} 
        alt={schoolName}
        className={`${size} rounded-lg object-cover bg-white/10 flex-shrink-0`}
        onError={() => setImageError(true)}
      />
    );
  }

  // Try Clearbit as fallback if we have a website
  if (schoolWebsite && !imageError) {
    const domain = schoolWebsite.replace(/^(https?:\/\/)/, '').split('/')[0];
    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    return (
      <img 
        src={clearbitUrl} 
        alt={schoolName}
        className={`${size} rounded-lg object-cover bg-white/10 flex-shrink-0`}
        onError={() => setImageError(true)}
      />
    );
  }

  // Fallback to initial circle
  return (
    <div className={`${size} rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center text-sm flex-shrink-0`}>
      {schoolName.charAt(0).toUpperCase()}
    </div>
  );
}