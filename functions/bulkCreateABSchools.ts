import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const generateSlug = (schoolName) => {
  return schoolName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const parseGradeRange = (gradeStr) => {
  if (!gradeStr) return { lowestGrade: null, highestGrade: null };
  
  const range = gradeStr.split('-');
  let lowest = null;
  let highest = null;
  
  if (range.length === 2) {
    const first = range[0].trim().toLowerCase();
    const second = range[1].trim();
    
    // Convert JK/SK/K/PK to grades
    if (first === 'pk') lowest = -2;
    else if (first === 'jk') lowest = -1;
    else if (first === 'sk') lowest = 0;
    else if (first === 'k') lowest = 0;
    else lowest = parseInt(first) || null;
    
    highest = parseInt(second) || null;
  }
  
  return { lowestGrade: lowest, highestGrade: highest };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const importBatchId = `ab_education_${Date.now()}`;

    // 40 Alberta independent schools data
    const schoolsData = [
      { name: 'Strathcona-Tweedsmuir School', address: '120093 2nd Street West', city: 'Okotoks', postalCode: 'T1S1A7', phone: '403-938-4431', website: 'www.strathconatweedsmuir.com', gradeRange: 'K-12', programType: 'IB World School', religiousAffiliation: 'Non-denominational' },
      { name: 'Webber Academy', address: '1515 93rd Street SW', city: 'Calgary', postalCode: 'T3H4A8', phone: '403-277-4700', website: 'www.webberacademy.ca', gradeRange: 'JK-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'West Island College', address: '7410 Blackfoot Trail SE', city: 'Calgary', postalCode: 'T2H1M5', phone: '403-255-5300', website: 'www.westislandcollege.ab.ca', gradeRange: '7-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Calgary Academy', address: '2451 Dieppe Avenue SW', city: 'Calgary', postalCode: 'T3E7K1', phone: '403-686-6444', website: 'www.calgaryacademy.com', gradeRange: '2-12', programType: 'Learning differences', religiousAffiliation: 'Non-denominational' },
      { name: 'Rundle College', address: '7375 17th Avenue SW', city: 'Calgary', postalCode: 'T3H3W5', phone: '403-250-7500', website: 'www.rundle.ab.ca', gradeRange: 'JK-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Delta West Academy', address: '414 11A Street NE', city: 'Calgary', postalCode: 'T2E4N3', phone: '403-290-0767', website: 'www.deltawestacademy.com', gradeRange: 'JK-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Edge School for Athletes', address: '33055 Township Road 250', city: 'Calgary', postalCode: 'T3Z3L4', phone: '403-246-5513', website: 'www.edgeschool.com', gradeRange: '4-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'The Renert School', address: '2120 Royal Vista Way NW', city: 'Calgary', postalCode: 'T3G0E1', phone: '403-452-3556', website: 'www.renertschool.ca', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Foothills Academy', address: '745 37th Street NW', city: 'Calgary', postalCode: 'T2N4T1', phone: '403-270-9400', website: 'www.foothillsacademy.org', gradeRange: '3-12', programType: 'Learning differences', religiousAffiliation: 'Non-denominational' },
      { name: 'Lycee Louis Pasteur', address: '4099 Garrison Boulevard SW', city: 'Calgary', postalCode: 'T2T6G2', phone: '403-243-5420', website: 'www.lycee.ca', gradeRange: 'PK-12', programType: 'French curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Bearspaw Christian School', address: '15001 69th Street NW', city: 'Calgary', postalCode: 'T3R1C4', phone: '403-295-6222', website: 'www.bearspawschool.com', gradeRange: 'JK-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Calgary Christian School', address: '2839 49th Street SW', city: 'Calgary', postalCode: 'T3E3X9', phone: '403-242-2896', website: 'www.calgarychristianschool.com', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Glenmore Christian Academy', address: '16520 24th Street SW', city: 'Calgary', postalCode: 'T2Y4W2', phone: '403-254-9050', website: 'www.gcaschool.com', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Calgary French & International School', address: '700 77th Street SW', city: 'Calgary', postalCode: 'T3H5R1', phone: '403-240-1500', website: 'www.cfis.com', gradeRange: 'K-12', programType: 'French immersion', religiousAffiliation: 'Non-denominational' },
      { name: 'Banbury Crossroads School', address: '2451 Dieppe Avenue SW', city: 'Calgary', postalCode: 'T3E7K1', phone: '403-270-7787', website: 'www.banburycrossroads.com', gradeRange: '1-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'River Valley School', address: '6720 Bowness Road NW', city: 'Calgary', postalCode: 'T3B0H3', phone: '403-286-4144', website: 'www.rivervalleyschool.ca', gradeRange: 'K-6', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Tempo School', address: '5603 148th Street NW', city: 'Edmonton', postalCode: 'T6H4T7', phone: '780-430-0877', website: 'www.temposchool.org', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Progressive Academy', address: '12215 112th Avenue NW', city: 'Edmonton', postalCode: 'T5M2V6', phone: '780-455-8344', website: 'www.progressiveacademy.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Edmonton Academy', address: '10545 166A Street NW', city: 'Edmonton', postalCode: 'T5P3Z9', phone: '780-489-6225', website: 'www.edmontonacademy.com', gradeRange: '1-12', programType: 'Learning differences', religiousAffiliation: 'Non-denominational' },
      { name: 'Meadowlark Christian School', address: '9720 165th Street', city: 'Edmonton', postalCode: 'T5P3T7', phone: '780-487-5892', website: 'www.meadowlarkchristian.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Edmonton Christian Schools', address: '14304 109A Avenue NW', city: 'Edmonton', postalCode: 'T5N1H3', phone: '780-474-5965', website: 'www.edmontonchristian.org', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Millwoods Christian School', address: '3407 38th Avenue', city: 'Edmonton', postalCode: 'T6L3T3', phone: '780-462-4961', website: 'www.millwoodschristianschool.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Prairie Christian Academy', address: '301 Highway 2A', city: 'Three Hills', postalCode: 'T0M2A0', phone: '403-443-5511', website: 'www.prairiechristianacademy.com', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Lethbridge Christian Academy', address: '217 12B Street North', city: 'Lethbridge', postalCode: 'T1H2K7', phone: '403-329-8851', website: 'www.lethbridgechristianacademy.com', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Red Deer Adventist Academy', address: '5218 22nd Street', city: 'Red Deer', postalCode: 'T4R2T4', phone: '403-343-6453', website: 'www.rdaa.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Adventist' },
      { name: 'Calgary Jewish Academy', address: '6700 Kootenay Street SW', city: 'Calgary', postalCode: 'T2V1P4', phone: '403-253-3992', website: 'www.cja.ab.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Akiva Academy', address: '140 Haddon Road SW', city: 'Calgary', postalCode: 'T2V2Y4', phone: '403-253-3994', website: 'www.akivaacademy.ca', gradeRange: 'K-6', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'North Point School for Boys', address: '2445 23rd Avenue SW', city: 'Calgary', postalCode: 'T3C0W3', phone: '403-313-3553', website: 'www.northpointschools.ca', gradeRange: 'K-6', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Maria Montessori Education Centre', address: '1519 Centre Street NW', city: 'Calgary', postalCode: 'T2E2R8', phone: '403-276-7344', website: 'www.mmec.ca', gradeRange: 'K-6', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Summit West Independent School', address: '3904 16th Avenue SW', city: 'Calgary', postalCode: 'T3C0P3', phone: '403-670-7275', website: 'www.summitwest.ca', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'School of Alberta Ballet', address: '906 12th Avenue SW', city: 'Calgary', postalCode: 'T2R0H4', phone: '403-245-2274', website: 'www.albertaballet.com', gradeRange: '7-12', programType: 'Arts-focused', religiousAffiliation: 'Non-denominational' },
      { name: 'Calgary Arts Academy', address: '2535 10th Avenue SW', city: 'Calgary', postalCode: 'T3C0S1', phone: '403-532-3020', website: 'www.caaschool.com', gradeRange: 'K-9', programType: 'Arts-focused', religiousAffiliation: 'Non-denominational' },
      { name: 'Airdrie Christian Academy', address: '605 Main Street South', city: 'Airdrie', postalCode: 'T4B3M3', phone: '403-948-1812', website: 'www.airdriechristianacademy.com', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Master\'s Academy', address: '4414 Crowchild Trail SW', city: 'Calgary', postalCode: 'T2T5J4', phone: '403-242-7034', website: 'www.masters.ab.ca', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Heritage Christian Academy', address: '2003 McKnight Boulevard NE', city: 'Calgary', postalCode: 'T2E6L2', phone: '403-219-3201', website: 'www.hcacalgary.com', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'West Island College Edmonton', address: '12603 132nd Avenue NW', city: 'Edmonton', postalCode: 'T5L3P9', phone: '780-437-8540', website: 'www.westislandcollege.ca', gradeRange: '7-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'St. John Bosco Private School', address: '712 Fortalice Crescent SE', city: 'Calgary', postalCode: 'T2A2E3', phone: '403-248-3664', website: 'www.sjbschool.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Chinook Winds Adventist Academy', address: '10101 2nd Avenue SW', city: 'Calgary', postalCode: 'T3C0C4', phone: '403-286-5686', website: 'www.chinookwinds.ca', gradeRange: 'K-12', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Adventist' },
      { name: 'Menno Simons Christian School', address: '7000 Elkton Drive SW', city: 'Calgary', postalCode: 'T3H2V5', phone: '403-531-0745', website: 'www.mennosimonschristianschool.ca', gradeRange: 'K-9', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Montessori Alberta', address: '1018 Kensington Road NW', city: 'Calgary', postalCode: 'T2N3P7', phone: '403-283-3311', website: 'www.montessorialberta.com', gradeRange: 'K-6', programType: 'Montessori', religiousAffiliation: 'Non-denominational' }
    ];

    // Transform schools with required fields
    const schools = schoolsData.map(school => {
      const { lowestGrade, highestGrade } = parseGradeRange(school.gradeRange);
      return {
        name: school.name,
        slug: generateSlug(school.name),
        address: school.address,
        city: school.city,
        provinceState: 'Alberta',
        country: 'Canada',
        region: 'Canada',
        phone: school.phone,
        website: school.website,
        email: '',
        lowestGrade,
        highestGrade,
        dataSource: 'ab_education',
        governmentId: '',
        schoolType: 'Private',
        religiousAffiliation: school.religiousAffiliation !== 'Non-denominational' ? school.religiousAffiliation : undefined,
        gradeSystem: 'north_american',
        status: 'active',
        importBatchId,
        verified: false,
        missionStatement: `${school.programType} program`
      };
    });

    console.log(`Importing ${schools.length} Alberta schools...`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Bulk create schools in batches
    for (let i = 0; i < schools.length; i += 10) {
      const batch = schools.slice(i, i + 10);
      
      for (const school of batch) {
        try {
          if (!school.name || !school.city || !school.country) {
            skipped++;
            errors.push({
              schoolName: school.name || 'Unknown',
              error: 'Missing required fields'
            });
            continue;
          }

          // Check if school already exists (by slug and city)
          const matches = await base44.asServiceRole.entities.School.filter({
            slug: school.slug,
            city: school.city
          });
          const existing = matches?.[0];

          if (existing) {
            // Update existing
            await base44.asServiceRole.entities.School.update(existing.id, {
              ...school,
              importBatchId,
              lastEnriched: new Date().toISOString()
            });
            updated++;
          } else {
            // Create new
            await base44.asServiceRole.entities.School.create({
              ...school,
              importBatchId,
              lastEnriched: new Date().toISOString()
            });
            created++;
          }
        } catch (error) {
          skipped++;
          errors.push({
            schoolName: school.name,
            error: error.message
          });
        }
      }
    }

    return Response.json({
      success: true,
      importBatchId,
      totalSchools: schools.length,
      results: {
        created,
        updated,
        skipped,
        total: schools.length,
        errors: errors.length > 0 ? errors : null
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});