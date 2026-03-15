import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle2, XCircle, Edit, Archive, Sparkles, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [enrichingSchoolId, setEnrichingSchoolId] = useState(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const data = await base44.entities.School.list('-updated_date');
      setSchools(data);
    } catch (error) {
      console.error('Failed to load schools:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (schoolId, verified) => {
    try {
      await base44.entities.School.update(schoolId, { verified });
      setSchools(schools.map(s => s.id === schoolId ? { ...s, verified } : s));
    } catch (error) {
      console.error('Failed to update verification:', error);
    }
  };

  const handleArchive = async (schoolId) => {
    try {
      await base44.entities.School.update(schoolId, { status: 'archived' });
      setSchools(schools.map(s => s.id === schoolId ? { ...s, status: 'archived' } : s));
    } catch (error) {
      console.error('Failed to archive:', error);
    }
  };

  const handleEnrichSchool = async (schoolId) => {
    if (!schools.find(s => s.id === schoolId)?.website) {
      toast.error('School has no website URL for enrichment');
      return;
    }
    setEnrichingSchoolId(schoolId);
    try {
      const response = await base44.functions.invoke('enrichSchoolFromWeb', { schoolId });
      if (response.data.status === 'success') {
        toast.success(`School enriched (${response.data.count || 0} fields updated)`);
        loadSchools();
      }
    } catch (error) {
      console.error('Enrichment failed:', error);
      toast.error(`Enrichment failed: ${error.message}`);
    } finally {
      setEnrichingSchoolId(null);
    }
  };

  const handleEnrichAllSchools = async () => {
    const confirmEnrich = confirm('Enrich all schools? This may take several minutes and will process in batches of 5.');
    if (!confirmEnrich) return;

    setEnrichingAll(true);
    setEnrichmentProgress({ current: 0, total: schools.length });

    const BATCH_SIZE = 5;
    const BATCH_DELAY = 2000; // 2 second delay between batches

    for (let i = 0; i < schools.length; i += BATCH_SIZE) {
      const batch = schools.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (school) => {
        const schoolIndex = schools.indexOf(school) + 1;
        setEnrichmentProgress({ current: schoolIndex, total: schools.length });
        
        try {
          await base44.functions.invoke('enrichSchoolFromWeb', { schoolId: school.id });
          console.log(`✓ Enriched ${school.name}`);
        } catch (error) {
          console.error(`✗ Failed to enrich ${school.name}:`, error);
        }
      });

      await Promise.all(batchPromises);
      
      // Delay between batches to prevent timeouts
      if (i + BATCH_SIZE < schools.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    toast.success('All schools enrichment complete');
    setEnrichingAll(false);
    setEnrichmentProgress({ current: 0, total: 0 });
    loadSchools();
  };

  const filteredSchools = schools.filter(school => {
    const matchesSearch = school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         school.city.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRegion = filterRegion === 'all' || school.region === filterRegion;
    return matchesSearch && matchesRegion;
  });

  const tierColors = {
    free: 'bg-slate-100 text-slate-700',
    basic: 'bg-blue-100 text-blue-700',
    premium: 'bg-amber-100 text-amber-700'
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-900">Schools Management</h2>
          <Button 
            onClick={handleEnrichAllSchools} 
            disabled={enrichingAll || loading}
            className="gap-2 bg-teal-600 hover:bg-teal-700"
          >
            {enrichingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enriching {enrichmentProgress.current}/{enrichmentProgress.total}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Enrich All Schools
              </>
            )}
          </Button>
        </div>
        
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search schools by name or city..."
              className="pl-10"
            />
          </div>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">All Regions</option>
            <option value="Canada">Canada</option>
            <option value="US">US</option>
            <option value="Europe">Europe</option>
          </select>
        </div>

        <div className="text-sm text-slate-600">
          Showing {filteredSchools.length} of {schools.length} schools
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-4 font-semibold text-sm">School Name</th>
                <th className="text-left p-4 font-semibold text-sm">City</th>
                <th className="text-left p-4 font-semibold text-sm">Region</th>
                <th className="text-left p-4 font-semibold text-sm">Tier</th>
                <th className="text-left p-4 font-semibold text-sm">Verified</th>
                <th className="text-left p-4 font-semibold text-sm">Last Updated</th>
                <th className="text-left p-4 font-semibold text-sm">Website</th>
                <th className="text-left p-4 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map((school) => (
                <tr key={school.id} className="border-b hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{school.name}</div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{school.city}</td>
                  <td className="p-4 text-sm text-slate-600">{school.region}</td>
                  <td className="p-4">
                    <Badge className={tierColors[school.schoolTier || 'free']}>
                      {(school.schoolTier || 'free').toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-4">
                    {school.verified ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-slate-400" />
                    )}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {new Date(school.updated_date).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm">
                    {school.website ? (
                      <a href={school.website} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline truncate max-w-[200px] block">
                        {(() => {
                          try {
                            return new URL(school.website).hostname;
                          } catch {
                            return school.website.substring(0, 30);
                          }
                        })()}
                      </a>
                    ) : (
                      <span className="text-slate-400">No website</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(`/SchoolAdmin?schoolId=${school.id}`, '_blank')}
                        title="Manage as this school"
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEnrichSchool(school.id)}
                        disabled={enrichingSchoolId === school.id || enrichingAll}
                        title={school.website ? 'Enrich from website' : 'No website URL'}
                      >
                        {enrichingSchoolId === school.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerify(school.id, !school.verified)}
                      >
                        {school.verified ? 'Unverify' : 'Verify'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleArchive(school.id)}
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}