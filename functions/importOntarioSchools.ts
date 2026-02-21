import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

const generateSlug = (schoolName) => {
  return schoolName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const mapGradeLevel = (schoolLevel) => {
  const normalized = schoolLevel?.trim().toLowerCase() || '';
  
  if (normalized.includes('elementary/secondary') || normalized.includes('elementary-secondary')) {
    return { lowestGrade: 'JK', highestGrade: '12' };
  }
  if (normalized.includes('secondary')) {
    return { lowestGrade: '9', highestGrade: '12' };
  }
  if (normalized.includes('elementary')) {
    return { lowestGrade: 'JK', highestGrade: '8' };
  }
  
  return {};
};

const mapCurriculumType = (programType) => {
  const normalized = programType?.trim().toLowerCase() || '';
  
  if (normalized.includes('montessori')) return 'Montessori';
  if (normalized.includes('waldorf')) return 'Waldorf';
  if (normalized.includes('ib')) return 'IB';
  if (normalized.includes('traditional')) return 'Traditional';
  
  return 'Traditional';
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('Fetching Ontario schools Excel file...');
    
    // Fetch the Excel file with User-Agent and common headers
    const fileUrl = 'https://files.ontario.ca/opendata/private_schools_contact_information_apr_2019_en.xlsx';
    const response = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Parsed ${rawData.length} rows from Excel file`);

    // Transform data to School format
    const schools = rawData
      .map((row, index) => {
        const schoolName = row['School Name'] || row['school name'] || '';
        const city = row['City'] || row['city'] || '';
        const province = row['Province'] || row['province'] || 'Ontario';
        const postalCode = row['Postal Code'] || row['postal code'] || '';
        const streetAddress = row['Street Address'] || row['street address'] || '';
        const phone = row['Telephone Number'] || row['telephone number'] || '';
        const website = row['School Website'] || row['school website'] || '';
        const governmentId = row['School Number'] || row['school number'] || '';
        const schoolLevel = row['School Level'] || row['school level'] || '';
        const programType = row['Program Type'] || row['program type'] || '';
        const association = row['Association Membership'] || row['association membership'] || '';

        // Filter out incomplete records
        if (!schoolName?.trim() || !city?.trim()) {
          console.log(`Skipping row ${index}: missing name or city`);
          return null;
        }

        // Combine address
        const address = [streetAddress, city, province, postalCode]
          .filter(part => part?.trim())
          .join(', ');

        // Map grade levels
        const gradeMapping = mapGradeLevel(schoolLevel);

        // Build school object
        const school = {
          name: schoolName.trim(),
          slug: generateSlug(schoolName),
          address: address,
          city: city.trim(),
          provinceState: 'Ontario',
          country: 'Canada',
          region: 'Canada',
          phone: phone?.trim() || undefined,
          website: website?.trim() || undefined,
          governmentId: governmentId?.trim() || undefined,
          curriculumType: mapCurriculumType(programType),
          gradesServed: schoolLevel?.trim() || undefined,
          lowestGrade: gradeMapping.lowestGrade,
          highestGrade: gradeMapping.highestGrade,
          currency: 'CAD',
          dataSource: 'ontario_ministry',
          gradeSystem: 'north_american',
          status: 'active',
          importBatchId: 'ontario_ministry_2024'
        };

        // Add accreditations if available
        if (association?.trim()) {
          school.accreditations = [association.trim()];
        }

        return school;
      })
      .filter(school => school !== null);

    console.log(`Prepared ${schools.length} schools for import`);

    // Call importSchoolBatch function
    const importResult = await base44.asServiceRole.functions.invoke('importSchoolBatch', {
      schools,
      importBatchId: 'ontario_ministry_2024'
    });

    return Response.json({
      success: true,
      source: 'Ontario Ministry of Education',
      fileUrl,
      totalParsed: rawData.length,
      totalProcessed: schools.length,
      importResult: importResult.summary || importResult
    });
  } catch (error) {
    console.error('Error importing Ontario schools:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});