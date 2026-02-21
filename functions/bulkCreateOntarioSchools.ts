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
    
    // Convert JK/SK to grades
    if (first === 'jk') lowest = -1;
    else if (first === 'sk') lowest = 0;
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

    const importBatchId = `ontario_ministry_${Date.now()}`;

    // 50 Ontario schools data
    const schoolsData = [
      { name: 'Appleby College', address: '540 Lakeshore Road West', city: 'Oakville', postalCode: 'L6K3P1', phone: '905-845-4681', website: 'www.appleby.on.ca', gradeRange: '7-12', governmentId: '879649', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Ashbury College', address: '362 Mariposa Avenue', city: 'Ottawa', postalCode: 'K1M0T3', phone: '613-749-5954', website: 'www.ashbury.ca', gradeRange: '4-12', governmentId: '879854', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Bayview Glen Independent School', address: '275 Duncan Mill Road', city: 'Toronto', postalCode: 'M3B3H9', phone: '416-443-1030', website: 'www.bayviewglen.ca', gradeRange: 'JK-12', governmentId: '879292', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'The Bishop Strachan School', address: '298 Lonsdale Road', city: 'Toronto', postalCode: 'M4V1X2', phone: '416-483-4325', website: 'www.bss.on.ca', gradeRange: 'JK-12', governmentId: '879508', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Anglican' },
      { name: 'Branksome Hall', address: '10 Elm Avenue', city: 'Toronto', postalCode: 'M4W1N4', phone: '416-920-9741', website: 'www.branksome.on.ca', gradeRange: 'JK-12', governmentId: '879169', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Crescent School', address: '2365 Bayview Avenue', city: 'Toronto', postalCode: 'M2L1A2', phone: '416-449-2556', website: 'www.crescentschool.org', gradeRange: '3-12', governmentId: '879532', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'De La Salle College', address: '131 Farnham Avenue', city: 'Toronto', postalCode: 'M4V1H7', phone: '416-969-8771', website: 'www.delasalle.ca', gradeRange: '5-12', governmentId: '879391', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Greenwood College School', address: '443 Mount Pleasant Road', city: 'Toronto', postalCode: 'M4S2L8', phone: '416-482-9811', website: 'www.greenwoodcollege.org', gradeRange: '7-12', governmentId: '882197', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Havergal College', address: '1451 Avenue Road', city: 'Toronto', postalCode: 'M5N2H9', phone: '416-483-3519', website: 'www.havergal.on.ca', gradeRange: 'JK-12', governmentId: '879714', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Hillfield Strathallan College', address: '299 Fennell Avenue West', city: 'Hamilton', postalCode: 'L9C1G3', phone: '905-389-1367', website: 'www.hsc.on.ca', gradeRange: 'JK-12', governmentId: '879441', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Holy Trinity School', address: '11300 Bayview Avenue', city: 'Richmond Hill', postalCode: 'L4S1L1', phone: '905-737-1114', website: 'www.hts.on.ca', gradeRange: 'JK-12', governmentId: '880163', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Lakefield College School', address: '4391 County Road 29', city: 'Lakefield', postalCode: 'K0L2H0', phone: '705-652-3324', website: 'www.lcs.on.ca', gradeRange: '9-12', governmentId: '879607', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Pickering College', address: '16945 Bayview Avenue', city: 'Newmarket', postalCode: 'L3Y4X2', phone: '905-895-1700', website: 'www.pickeringcollege.on.ca', gradeRange: 'JK-12', governmentId: '879862', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Ridley College', address: '2 Ridley Road', city: 'St. Catharines', postalCode: 'L2R7C3', phone: '905-684-1889', website: 'www.ridleycollege.com', gradeRange: 'JK-12', governmentId: '879789', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Royal St. George\'s College', address: '120 Howland Avenue', city: 'Toronto', postalCode: 'M5R3B5', phone: '416-533-9481', website: 'www.rsgc.on.ca', gradeRange: '3-12', governmentId: '879235', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Anglican' },
      { name: 'St. Andrew\'s College', address: '15800 Yonge Street', city: 'Aurora', postalCode: 'L4G3H7', phone: '905-727-3178', website: 'www.sac.on.ca', gradeRange: '5-12', governmentId: '879631', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'St. Clement\'s School', address: '21 St. Clements Avenue', city: 'Toronto', postalCode: 'M4R1G8', phone: '416-483-4835', website: 'www.scs.on.ca', gradeRange: '1-12', governmentId: '879367', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'St. Michael\'s College School', address: '1515 Bathurst Street', city: 'Toronto', postalCode: 'M5P3H4', phone: '416-653-3180', website: 'www.stmichaelscollegeschool.com', gradeRange: '7-12', governmentId: '879342', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Sterling Hall School', address: '99 Cartwright Avenue', city: 'Toronto', postalCode: 'M6A1V4', phone: '416-972-8811', website: 'www.sterlinghall.com', gradeRange: 'JK-8', governmentId: '880205', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'TanenbaumCHAT', address: '200 Wilmington Avenue', city: 'Toronto', postalCode: 'M3H5J8', phone: '416-636-5984', website: 'www.tanenbaumchat.org', gradeRange: '9-12', governmentId: '879318', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Toronto French School', address: '306 Lawrence Avenue East', city: 'Toronto', postalCode: 'M4N1T7', phone: '416-484-6533', website: 'www.tfs.ca', gradeRange: 'JK-12', governmentId: '879565', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Trinity College School', address: '55 Deblaquire Street North', city: 'Port Hope', postalCode: 'L1A4K7', phone: '905-885-3209', website: 'www.tcs.on.ca', gradeRange: '5-12', governmentId: '879813', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Upper Canada College', address: '200 Lonsdale Road', city: 'Toronto', postalCode: 'M4V1W6', phone: '416-488-1125', website: 'www.ucc.on.ca', gradeRange: 'JK-12', governmentId: '879482', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Trafalgar Castle School', address: '401 Reynolds Street', city: 'Whitby', postalCode: 'L1N3W9', phone: '905-668-3358', website: 'www.trafalgarcastle.ca', gradeRange: '5-12', governmentId: '879847', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Albert College', address: '160 Dundas Street West', city: 'Belleville', postalCode: 'K8P1A6', phone: '613-968-5726', website: 'www.albertcollege.ca', gradeRange: 'JK-12', governmentId: '879821', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Montcrest School', address: '4 Montcrest Boulevard', city: 'Toronto', postalCode: 'M4K1J7', phone: '416-469-2008', website: 'www.montcrest.on.ca', gradeRange: 'JK-8', governmentId: '879276', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'The York School', address: '1320 Yonge Street', city: 'Toronto', postalCode: 'M4T1X2', phone: '416-926-1325', website: 'www.yorkschool.com', gradeRange: 'JK-12', governmentId: '879623', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Crestwood Preparatory College', address: '217 Brookbanks Drive', city: 'Toronto', postalCode: 'M3A2T7', phone: '416-391-1441', website: 'www.crestwood.on.ca', gradeRange: '7-12', governmentId: '880635', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Country Day School', address: '13415 Dufferin Street', city: 'King City', postalCode: 'L7B1K5', phone: '905-833-1220', website: 'www.cds.on.ca', gradeRange: 'JK-12', governmentId: '879987', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Mentor College', address: '40 Forest Avenue', city: 'Mississauga', postalCode: 'L5G1S2', phone: '905-274-0248', website: 'www.mentorcollege.edu', gradeRange: 'JK-12', governmentId: '879938', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Bond Academy', address: '1500 Birchmount Road', city: 'Scarborough', postalCode: 'M1P2G3', phone: '416-615-0671', website: 'www.bondacademy.ca', gradeRange: 'JK-12', governmentId: '881987', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Villanova College', address: '2480 15th Sideroad', city: 'King City', postalCode: 'L7B1A4', phone: '905-833-1909', website: 'www.villanovacollege.org', gradeRange: '4-12', governmentId: '880700', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Blyth Academy Toronto', address: '2660 Yonge Street', city: 'Toronto', postalCode: 'M4P2J5', phone: '416-515-8540', website: 'www.blytheducation.com', gradeRange: '9-12', governmentId: '883527', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Fieldstone Day School', address: '2999 Dufferin Street', city: 'Toronto', postalCode: 'M6B3T4', phone: '416-487-7688', website: 'www.fieldstonedayschool.org', gradeRange: 'JK-12', governmentId: '880031', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Kingsway College School', address: '4600 Dundas Street West', city: 'Etobicoke', postalCode: 'M9A1B2', phone: '416-843-3052', website: 'www.kcs.on.ca', gradeRange: 'JK-8', governmentId: '882395', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'J. Addison School', address: '2 Valleywood Drive', city: 'Markham', postalCode: 'L3R8H3', phone: '905-477-4999', website: 'www.jaddisonschool.com', gradeRange: 'JK-12', governmentId: '881367', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Rosseau Lake College', address: '1967 Bright Street', city: 'Rosseau', postalCode: 'P0C1J0', phone: '705-732-4351', website: 'www.rosseaulakecollege.com', gradeRange: '7-12', governmentId: '879730', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Waldorf Academy', address: '2 Rowanwood Avenue', city: 'Toronto', postalCode: 'M4W1N9', phone: '416-964-8264', website: 'www.waldorfacademy.org', gradeRange: 'JK-12', governmentId: '880478', programType: 'Waldorf education', religiousAffiliation: 'Non-denominational' },
      { name: 'Peoples Christian Academy', address: '374 Sheppard Avenue East', city: 'Toronto', postalCode: 'M2N3B6', phone: '416-222-3341', website: 'www.pcatoronto.org', gradeRange: 'JK-12', governmentId: '879110', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Cornerstone Christian Academy', address: '1 Father Frechette Way', city: 'Scarborough', postalCode: 'M1G1G4', phone: '416-289-5017', website: 'www.cornerstoneca.com', gradeRange: 'JK-8', governmentId: '882981', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Linbrook School', address: '1079 Linbrook Road', city: 'Oakville', postalCode: 'L6J2L1', phone: '905-844-8225', website: 'www.linbrook.ca', gradeRange: 'JK-8', governmentId: '881458', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'WillowWood School', address: '55 Scarsdale Road', city: 'North York', postalCode: 'M3B2R3', phone: '416-444-7644', website: 'www.willowwoodschool.ca', gradeRange: 'JK-8', governmentId: '880890', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Aurora Preparatory Academy', address: '81 Industrial Parkway North', city: 'Aurora', postalCode: 'L4G4C4', phone: '905-713-1141', website: 'www.aurora-prep.com', gradeRange: 'JK-8', governmentId: '885099', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'NOIC Academy', address: '40 Vogell Road', city: 'Richmond Hill', postalCode: 'L4B3N6', phone: '905-884-1590', website: 'www.noic.ca', gradeRange: '9-12', governmentId: '883279', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'MacLachlan College', address: '337 Trafalgar Road', city: 'Oakville', postalCode: 'L6J3H3', phone: '905-844-0372', website: 'www.maclachlan.ca', gradeRange: 'JK-12', governmentId: '880130', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Overton Academy', address: '95 Advance Road', city: 'Etobicoke', postalCode: 'M8Z2S6', phone: '416-521-5032', website: 'www.overtonacademy.com', gradeRange: '9-12', governmentId: '886117', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Newton\'s Grove School', address: '30 Drewry Avenue', city: 'Toronto', postalCode: 'M2M1C8', phone: '416-221-8802', website: 'www.newtonsgrove.com', gradeRange: 'JK-8', governmentId: '879144', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Prestige School', address: '1120 Finch Avenue West', city: 'Toronto', postalCode: 'M3J3J4', phone: '416-630-6300', website: 'www.prestigeschool.ca', gradeRange: '7-12', governmentId: '880817', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Hudson College', address: '21 Ascot Avenue', city: 'Toronto', postalCode: 'M6E1E6', phone: '416-351-0230', website: 'www.hudsoncollege.ca', gradeRange: 'JK-12', governmentId: '882734', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Sunnybrook School', address: '40 Thomas Riley Road', city: 'Etobicoke', postalCode: 'M9B1B5', phone: '416-239-2671', website: 'www.sunnybrookschool.ca', gradeRange: 'JK-8', governmentId: '879177', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' }
    ];

    // Transform schools with required fields
    const schools = schoolsData.map(school => {
      const { lowestGrade, highestGrade } = parseGradeRange(school.gradeRange);
      return {
        name: school.name,
        slug: generateSlug(school.name),
        address: school.address,
        city: school.city,
        provinceState: 'Ontario',
        country: 'Canada',
        region: 'Canada',
        phone: school.phone,
        website: school.website,
        email: '',
        lowestGrade,
        highestGrade,
        dataSource: 'ontario_ministry',
        governmentId: school.governmentId,
        schoolType: 'Private',
        religiousAffiliation: school.religiousAffiliation !== 'Non-denominational' ? school.religiousAffiliation : undefined,
        gradeSystem: 'north_american',
        status: 'active',
        importBatchId,
        verified: false,
        missionStatement: `${school.programType} program`
      };
    });

    console.log(`Importing ${schools.length} Ontario schools...`);

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

          // Check if school already exists (by governmentId)
          let existing = null;
          if (school.governmentId) {
            const matches = await base44.asServiceRole.entities.School.filter({
              governmentId: school.governmentId
            });
            existing = matches?.[0];
          }

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