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
    
    // Convert JK/SK/K to grades
    if (first === 'jk') lowest = -1;
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

    const importBatchId = `bc_ministry_${Date.now()}`;

    // 50 BC independent schools data
    const schoolsData = [
      { name: 'St. George\'s School', address: '4175 West 29th Avenue', city: 'Vancouver', postalCode: 'V6S1V1', phone: '604-224-1304', website: 'www.stgeorges.bc.ca', gradeRange: '1-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Crofton House School', address: '3200 West 41st Avenue', city: 'Vancouver', postalCode: 'V6N3E1', phone: '604-263-3255', website: 'www.croftonhouse.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'York House School', address: '4176 Alexandra Street', city: 'Vancouver', postalCode: 'V6J4C6', phone: '604-736-6551', website: 'www.yorkhouse.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'West Point Grey Academy', address: '4125 West 8th Avenue', city: 'Vancouver', postalCode: 'V6R4R6', phone: '604-222-8750', website: 'www.wpga.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Collingwood School', address: '70 Morven Drive', city: 'West Vancouver', postalCode: 'V7S1B2', phone: '604-925-3331', website: 'www.collingwood.org', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Mulgrave School', address: '2330 Cypress Bowl Lane', city: 'West Vancouver', postalCode: 'V7S3H9', phone: '604-922-3223', website: 'www.mulgrave.com', gradeRange: 'JK-12', governmentId: '', programType: 'IB World School', religiousAffiliation: 'Non-denominational' },
      { name: 'Shawnigan Lake School', address: '1975 Renfrew Road', city: 'Shawnigan Lake', postalCode: 'V0R2W1', phone: '250-743-6148', website: 'www.shawnigan.ca', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Brentwood College School', address: '2735 Mount Baker Road', city: 'Mill Bay', postalCode: 'V0R2P1', phone: '250-743-5521', website: 'www.brentwood.ca', gradeRange: '9-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'St. Michaels University School', address: '3400 Richmond Road', city: 'Victoria', postalCode: 'V8P4T5', phone: '250-592-2411', website: 'www.smus.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Glenlyon Norfolk School', address: '801 Bank Street', city: 'Victoria', postalCode: 'V8S4A6', phone: '250-370-6800', website: 'www.mygns.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Queen Margaret\'s School', address: '660 Brownsey Avenue', city: 'Duncan', postalCode: 'V9L1C2', phone: '250-746-4185', website: 'www.qms.bc.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'St. Margaret\'s School', address: '1080 Lucas Avenue', city: 'Victoria', postalCode: 'V8X3P7', phone: '250-479-7171', website: 'www.stmarg.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Meadowridge School', address: '12224 240th Street', city: 'Maple Ridge', postalCode: 'V4R1N1', phone: '604-467-4444', website: 'www.meadowridge.bc.ca', gradeRange: 'JK-12', governmentId: '', programType: 'IB World School', religiousAffiliation: 'Non-denominational' },
      { name: 'Southridge School', address: '2656 160th Street', city: 'Surrey', postalCode: 'V3Z0C6', phone: '604-535-5056', website: 'www.southridge.bc.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Fraser Academy', address: '2294 West 10th Avenue', city: 'Vancouver', postalCode: 'V6K2H8', phone: '604-736-5575', website: 'www.fraseracademy.ca', gradeRange: '1-12', governmentId: '', programType: 'Learning differences', religiousAffiliation: 'Non-denominational' },
      { name: 'Stratford Hall', address: '3000 Commercial Drive', city: 'Vancouver', postalCode: 'V5N4E7', phone: '604-436-0608', website: 'www.stratfordhall.ca', gradeRange: 'K-12', governmentId: '', programType: 'IB World School', religiousAffiliation: 'Non-denominational' },
      { name: 'St. John\'s School', address: '2215 West 10th Avenue', city: 'Vancouver', postalCode: 'V6K2J1', phone: '604-732-4434', website: 'www.stjohns.bc.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Vancouver College', address: '5400 Cartier Street', city: 'Vancouver', postalCode: 'V6M3A5', phone: '604-261-4285', website: 'www.vc.bc.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Little Flower Academy', address: '4195 Alexandra Street', city: 'Vancouver', postalCode: 'V6J4C6', phone: '604-738-9016', website: 'www.lfabc.org', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Catholic' },
      { name: 'Bodwell High School', address: '955 Harbourside Drive', city: 'North Vancouver', postalCode: 'V7P3S4', phone: '604-924-5056', website: 'www.bodwell.edu', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Brockton School', address: '3467 Duval Road', city: 'North Vancouver', postalCode: 'V7J3E8', phone: '604-985-8422', website: 'www.brocktonschool.com', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Southpointe Academy', address: '1900 56th Street', city: 'Delta', postalCode: 'V4L2B1', phone: '604-948-8826', website: 'www.southpointeacademy.ca', gradeRange: 'K-12', governmentId: '', programType: 'IB World School', religiousAffiliation: 'Non-denominational' },
      { name: 'Aspengrove School', address: '7660 Clark Drive', city: 'Lantzville', postalCode: 'V0R2H0', phone: '250-390-2201', website: 'www.aspengrove.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Aberdeen Hall Preparatory School', address: '950 Academy Way', city: 'Kelowna', postalCode: 'V1V3A4', phone: '250-491-1270', website: 'www.aberdeenhall.com', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Pattison High School', address: '956 West 8th Avenue', city: 'Vancouver', postalCode: 'V5Z1E5', phone: '604-248-2420', website: 'www.pattisonhighschool.ca', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Urban Academy', address: '75 2nd Avenue West', city: 'Vancouver', postalCode: 'V5Y1B3', phone: '604-568-5665', website: 'www.urbanacademy.ca', gradeRange: 'K-7', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Alexander Academy', address: '688 West Hastings Street', city: 'Vancouver', postalCode: 'V6B1P1', phone: '604-688-8883', website: 'www.alexanderacademy.ca', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Pacific Academy', address: '10238 168th Street', city: 'Surrey', postalCode: 'V4N1Z4', phone: '604-581-5353', website: 'www.mypacificacademy.net', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Regent Christian Academy', address: '1570 Oxford Street', city: 'Surrey', postalCode: 'V4B3R5', phone: '604-531-8106', website: 'www.regent.bc.ca', gradeRange: 'JK-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'BC Christian Academy', address: '15100 66th Avenue', city: 'Surrey', postalCode: 'V3S2A6', phone: '604-576-5050', website: 'www.bccaschool.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Abbotsford Christian School', address: '35011 Old Clayburn Road', city: 'Abbotsford', postalCode: 'V2S7P5', phone: '604-859-0011', website: 'www.abbotsfordchristian.com', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'King David High School', address: '5718 Willow Street', city: 'Vancouver', postalCode: 'V5Z4S9', phone: '604-263-9700', website: 'www.kingdavidhigh.com', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Vancouver Talmud Torah', address: '998 West 26th Avenue', city: 'Vancouver', postalCode: 'V5Z2G1', phone: '604-736-7307', website: 'www.talmudtorah.com', gradeRange: 'K-7', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Vancouver Waldorf School', address: '2725 St. Christophers Road', city: 'North Vancouver', postalCode: 'V7K2B6', phone: '604-985-7435', website: 'www.vancouverwaldorf.org', gradeRange: 'K-8', governmentId: '', programType: 'Waldorf education', religiousAffiliation: 'Non-denominational' },
      { name: 'Kelowna Waldorf School', address: '429 Collett Road', city: 'Kelowna', postalCode: 'V1W1A1', phone: '250-764-4130', website: 'www.kelownawaldorf.org', gradeRange: 'K-8', governmentId: '', programType: 'Waldorf education', religiousAffiliation: 'Non-denominational' },
      { name: 'Island Pacific School', address: '2695 Hammond Bay Road', city: 'Nanaimo', postalCode: 'V9T1E2', phone: '250-740-2155', website: 'www.islandpacific.org', gradeRange: '6-9', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Kenneth Gordon Maplewood School', address: '420 Seymour River Place', city: 'North Vancouver', postalCode: 'V7H0B8', phone: '604-929-5131', website: 'www.kgms.ca', gradeRange: '1-12', governmentId: '', programType: 'Learning differences', religiousAffiliation: 'Non-denominational' },
      { name: 'Pythagoras Academy', address: '7671 Granville Street', city: 'Vancouver', postalCode: 'V6P4Y8', phone: '604-263-1401', website: 'www.pythagorasacademy.ca', gradeRange: 'K-8', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Rosseau Lake College BC', address: '1090 Roberts Creek Road', city: 'Roberts Creek', postalCode: 'V0N2W2', phone: '604-886-2112', website: 'www.elphinstoneschool.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Coast Mountain Academy', address: '4117 Tantalus Drive', city: 'Whistler', postalCode: 'V8E0L3', phone: '604-905-9536', website: 'www.coastmountainacademy.ca', gradeRange: '8-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Choice School for Gifted', address: '2720 Douglas Street', city: 'Victoria', postalCode: 'V8T4M6', phone: '250-382-7155', website: 'www.choiceschool.org', gradeRange: 'K-8', governmentId: '', programType: 'Gifted education', religiousAffiliation: 'Non-denominational' },
      { name: 'Deer Lake School', address: '5607 Deer Lake Avenue', city: 'Burnaby', postalCode: 'V5G3T5', phone: '604-294-5522', website: 'www.deerlakeschool.com', gradeRange: 'K-7', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Madrona School Society', address: '3120 Washington Avenue', city: 'Victoria', postalCode: 'V9A1P6', phone: '250-389-6614', website: 'www.madronaschool.ca', gradeRange: 'K-8', governmentId: '', programType: 'Waldorf education', religiousAffiliation: 'Non-denominational' },
      { name: 'Pear Tree Elementary', address: '115 Woodland Drive', city: 'Vancouver', postalCode: 'V5L3R8', phone: '604-559-1115', website: 'www.peartreelearning.com', gradeRange: 'JK-7', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Willowstone Academy', address: '3855 Henning Drive', city: 'Burnaby', postalCode: 'V5C6N5', phone: '604-299-8778', website: 'www.willowstone.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Langley Christian School', address: '21789 56th Avenue', city: 'Langley', postalCode: 'V2Y1L6', phone: '604-534-3151', website: 'www.langleychristian.com', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Kelowna Christian School', address: '2870 Benvoulin Road', city: 'Kelowna', postalCode: 'V1W2E3', phone: '250-861-3238', website: 'www.kcschool.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Victoria Christian School', address: '788 Hillside Avenue', city: 'Victoria', postalCode: 'V8T1Z5', phone: '250-384-3543', website: 'www.victoriac.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Nanaimo Christian School', address: '198 Howard Avenue', city: 'Nanaimo', postalCode: 'V9R3C7', phone: '250-754-4512', website: 'www.nanaimochristian.ca', gradeRange: 'K-12', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Duncan Christian School', address: '471 Beverly Street', city: 'Duncan', postalCode: 'V9L2C6', phone: '250-746-0380', website: 'www.duncanchristian.ca', gradeRange: 'K-9', governmentId: '', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' }
    ];

    // Transform schools with required fields
    const schools = schoolsData.map(school => {
      const { lowestGrade, highestGrade } = parseGradeRange(school.gradeRange);
      return {
        name: school.name,
        slug: generateSlug(school.name),
        address: school.address,
        city: school.city,
        provinceState: 'British Columbia',
        country: 'Canada',
        region: 'Canada',
        phone: school.phone,
        website: school.website,
        email: '',
        lowestGrade,
        highestGrade,
        dataSource: 'bc_ministry',
        governmentId: school.governmentId || '',
        schoolType: 'Private',
        religiousAffiliation: school.religiousAffiliation !== 'Non-denominational' ? school.religiousAffiliation : undefined,
        gradeSystem: 'north_american',
        status: 'active',
        importBatchId,
        verified: false,
        missionStatement: `${school.programType} program`
      };
    });

    console.log(`Importing ${schools.length} BC schools...`);

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

          // Check if school already exists (by slug and city to avoid duplicates across provinces)
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