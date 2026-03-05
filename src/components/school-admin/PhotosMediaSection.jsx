import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PhotosMediaSection({ school, onUpdate }) {
  const [uploading, setUploading] = useState(null);
  const [formData, setFormData] = useState({
    videoUrl: school?.videos?.[0] || '',
    virtualTourUrl: school?.virtualTourUrl || '',
  });

  const recalculateScore = () => {
    base44.functions.invoke('calculateCompletenessScore', { schoolId: school.id })
      .catch(e => console.warn('completenessScore update failed:', e));
  };

  const handleFileUpload = async (field, file) => {
    if (!file) return;

    setUploading(field);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      if (field === 'logoUrl') {
        await base44.entities.School.update(school.id, { logoUrl: file_url });
      } else if (field === 'headerPhotoUrl') {
        await base44.entities.School.update(school.id, { headerPhotoUrl: file_url });
      }
      
      onUpdate && onUpdate(field, file_url);
      toast.success('Photo uploaded successfully');
      recalculateScore();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(null);
    }
  };

  const handleGalleryUpload = async (file) => {
    if (!file) return;

    setUploading('gallery');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newGallery = [...(school?.photoGallery || []), file_url];
      await base44.entities.School.update(school.id, { photoGallery: newGallery });
      onUpdate && onUpdate('photoGallery', newGallery);
      toast.success('Photo added to gallery');
      recalculateScore();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(null);
    }
  };

  const handleRemovePhoto = async (field, url) => {
    try {
      if (field === 'logoUrl') {
        await base44.entities.School.update(school.id, { logoUrl: null });
        onUpdate && onUpdate('logoUrl', null);
      } else if (field === 'headerPhotoUrl') {
        await base44.entities.School.update(school.id, { headerPhotoUrl: null });
        onUpdate && onUpdate('headerPhotoUrl', null);
      } else if (field === 'gallery') {
        const newGallery = school.photoGallery.filter(u => u !== url);
        await base44.entities.School.update(school.id, { photoGallery: newGallery });
        onUpdate && onUpdate('photoGallery', newGallery);
      }
      toast.success('Photo removed');
      recalculateScore();
    } catch (error) {
      console.error('Failed to remove photo:', error);
      toast.error('Failed to remove photo');
    }
  };

  const handleUrlChange = async (field, value) => {
    setFormData({ ...formData, [field]: value });
    
    const updateData = {};
    if (field === 'videoUrl') {
      updateData.videos = value ? [value] : [];
    } else if (field === 'virtualTourUrl') {
      updateData.virtualTourUrl = value;
    }

    try {
      await base44.entities.School.update(school.id, updateData);
      recalculateScore();
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save changes');
    }
  };

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-4">School Logo</h3>
        <p className="text-xs text-slate-600 mb-4">Recommended: Square, 400x400px, PNG/JPG</p>
        {school?.logoUrl && (
          <div className="mb-4 flex items-center gap-4">
            <img src={school.logoUrl} alt="Logo" className="h-24 w-24 rounded-lg border object-cover" />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRemovePhoto('logoUrl', school.logoUrl)}
            >
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload('logoUrl', e.target.files?.[0])}
            disabled={uploading === 'logoUrl'}
            className="hidden"
          />
          <Button variant="outline" disabled={uploading === 'logoUrl'} asChild>
            {uploading === 'logoUrl' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Logo
              </>
            )}
          </Button>
        </label>
      </div>

      {/* Header Photo */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-4">Header Photo</h3>
        <p className="text-xs text-slate-600 mb-4">Recommended: Landscape, 1200x400px</p>
        {school?.headerPhotoUrl && (
          <div className="mb-4 flex flex-col gap-3">
            <img src={school.headerPhotoUrl} alt="Header" className="h-32 w-full rounded-lg border object-cover" />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRemovePhoto('headerPhotoUrl', school.headerPhotoUrl)}
              className="w-fit"
            >
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload('headerPhotoUrl', e.target.files?.[0])}
            disabled={uploading === 'headerPhotoUrl'}
            className="hidden"
          />
          <Button variant="outline" disabled={uploading === 'headerPhotoUrl'} asChild>
            {uploading === 'headerPhotoUrl' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Header Photo
              </>
            )}
          </Button>
        </label>
      </div>

      {/* Photo Gallery */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-2">Photo Gallery</h3>
        <p className="text-xs text-slate-600 mb-4">
          {(school?.photoGallery?.length || 0)} of 3 minimum for complete profile
        </p>
        {(school?.photoGallery || []).length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-4">
            {school.photoGallery.map((url, idx) => (
              <div key={idx} className="relative">
                <img src={url} alt={`Gallery ${idx + 1}`} className="h-32 w-full rounded-lg border object-cover" />
                <button
                  onClick={() => handleRemovePhoto('gallery', url)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleGalleryUpload(e.target.files?.[0])}
            disabled={uploading === 'gallery'}
            className="hidden"
          />
          <Button variant="outline" disabled={uploading === 'gallery'} asChild>
            {uploading === 'gallery' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Add Photo
              </>
            )}
          </Button>
        </label>
      </div>

      {/* Video URL */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-2">Video URL</h3>
        <p className="text-xs text-slate-600 mb-3">YouTube or Vimeo URL (optional)</p>
        <Input
          value={formData.videoUrl}
          onChange={(e) => handleUrlChange('videoUrl', e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
        />
      </div>

      {/* Virtual Tour URL */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-2">Virtual Tour URL</h3>
        <p className="text-xs text-slate-600 mb-3">Link to virtual tour (optional)</p>
        <Input
          value={formData.virtualTourUrl}
          onChange={(e) => handleUrlChange('virtualTourUrl', e.target.value)}
          placeholder="https://example.com/tour"
        />
      </div>
    </div>
  );
}