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

    // 50 Ontario schools data - Batch 2 (Schools 51-100)
    const schoolsData = [
      { name: 'Alma Mater School', address: '60 Sheppard Avenue East', city: 'Toronto', postalCode: 'M2N0G3', phone: '416-223-3862', website: 'www.almamater.ca', gradeRange: 'JK-8', governmentId: '880379', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Montessori House of Children', address: '66 Collier Street', city: 'Barrie', postalCode: 'L4M1H2', phone: '705-726-4492', website: 'www.montessoribarrie.com', gradeRange: 'JK-6', governmentId: '880056', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Timothy Christian School', address: '7 Lowes Avenue', city: 'Barrie', postalCode: 'L4N6V5', phone: '705-726-6691', website: 'www.timothychristian.ca', gradeRange: 'JK-8', governmentId: '880924', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Mississauga Christian Academy', address: '1920 Fowler Drive', city: 'Mississauga', postalCode: 'L5K0A3', phone: '905-855-8838', website: 'www.mcaschool.ca', gradeRange: 'JK-8', governmentId: '882866', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'King\'s Christian Collegiate', address: '528 Burnhamthorpe Road West', city: 'Oakville', postalCode: 'L6M4K5', phone: '905-257-5464', website: 'www.kingschristiancollegiate.com', gradeRange: '9-12', governmentId: '882049', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Toronto Prep School', address: '250 Davisville Avenue', city: 'Toronto', postalCode: 'M4S1H2', phone: '416-545-1020', website: 'www.torontoprep.com', gradeRange: '7-12', governmentId: '884354', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Whitby Montessori & Elementary School', address: '80 Burns Street East', city: 'Whitby', postalCode: 'L1N4A1', phone: '905-668-8882', website: 'www.whitbymontessori.com', gradeRange: 'JK-8', governmentId: '880445', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Town Centre Private Schools', address: '50 Town Centre Court', city: 'Scarborough', postalCode: 'M1P4Y7', phone: '416-283-1611', website: 'www.tcps.on.ca', gradeRange: 'JK-12', governmentId: '881078', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Ontario Christian School', address: '43 Hwy 5', city: 'Dundas', postalCode: 'L9H5E1', phone: '905-648-6655', website: 'www.ocschool.org', gradeRange: 'JK-8', governmentId: '879250', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Heritage Christian School', address: '374 Hwy 8', city: 'Hamilton', postalCode: 'L8G1H5', phone: '905-578-5691', website: 'www.heritagechristianschool.ca', gradeRange: 'JK-12', governmentId: '879201', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Calvin Christian School', address: '547 West 5th Street', city: 'Hamilton', postalCode: 'L9C3R3', phone: '905-388-2645', website: 'www.ccshamilton.ca', gradeRange: 'JK-8', governmentId: '879896', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Woodland Christian High School', address: '130 Woodland Road', city: 'Breslau', postalCode: 'N0B1M0', phone: '519-648-2114', website: 'www.woodland.on.ca', gradeRange: '9-12', governmentId: '880619', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Rockway Mennonite Collegiate', address: '110 Doon Road', city: 'Kitchener', postalCode: 'N2G3C8', phone: '519-743-5209', website: 'www.rockway.ca', gradeRange: '7-12', governmentId: '879078', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Mennonite' },
      { name: 'Great Lakes Christian High School', address: '4875 King Street', city: 'Beamsville', postalCode: 'L3J1L4', phone: '905-563-5374', website: 'www.glchs.on.ca', gradeRange: '9-12', governmentId: '879722', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Redeemer Christian School', address: '82 Colonnade Road', city: 'Ottawa', postalCode: 'K2E7L2', phone: '613-723-9262', website: 'www.redeemerschool.ca', gradeRange: 'JK-8', governmentId: '881938', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'London Christian Academy', address: '265 Fanshawe Park Road East', city: 'London', postalCode: 'N5X3W1', phone: '519-455-4360', website: 'www.lcalondon.ca', gradeRange: 'JK-12', governmentId: '882908', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Quinte Christian High School', address: '138 Wallbridge Loyalist Road', city: 'Belleville', postalCode: 'K8N4Z9', phone: '613-968-7870', website: 'www.qchs.ca', gradeRange: '9-12', governmentId: '880858', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Emmanuel Christian High School', address: '680 Tower Street South', city: 'Fergus', postalCode: 'N1M2R1', phone: '519-843-3203', website: 'www.echs.ca', gradeRange: '9-12', governmentId: '879854', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Guido de Bres Christian High School', address: '420 East 25th Street', city: 'Hamilton', postalCode: 'L8V3B4', phone: '905-574-4011', website: 'www.guidodebres.com', gradeRange: '9-12', governmentId: '879060', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'London District Christian Secondary School', address: '21557 Jefferies Road', city: 'Komoka', postalCode: 'N0L1R0', phone: '519-471-4661', website: 'www.ldcss.ca', gradeRange: '9-12', governmentId: '879045', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Toronto Montessori Schools', address: '8569 Bayview Avenue', city: 'Richmond Hill', postalCode: 'L4B3M7', phone: '905-889-6882', website: 'www.tmsschool.ca', gradeRange: 'JK-12', governmentId: '880494', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Dearcroft Montessori School', address: '1175 Central Park Drive', city: 'Oakville', postalCode: 'L6H4B1', phone: '905-844-2114', website: 'www.dearcroft.on.ca', gradeRange: 'JK-8', governmentId: '880957', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Fern Hill School', address: '3300 Pharmacy Avenue', city: 'Scarborough', postalCode: 'M1W3K4', phone: '416-498-5557', website: 'www.fernhillschool.com', gradeRange: 'JK-8', governmentId: '880809', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Signet Christian School', address: '300 Eaton Street', city: 'Georgetown', postalCode: 'L7G3Y7', phone: '905-877-4700', website: 'www.signetchristian.ca', gradeRange: 'JK-8', governmentId: '882486', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Smithville District Christian High School', address: '6488 Smithville Road', city: 'Smithville', postalCode: 'L0R2A0', phone: '905-957-3255', website: 'www.sdchs.ca', gradeRange: '9-12', governmentId: '879417', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Redeemer University College School', address: '777 Garner Road East', city: 'Ancaster', postalCode: 'L9K1J4', phone: '905-648-2131', website: 'www.redeemer.ca', gradeRange: '9-12', governmentId: '882197', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Niagara Christian Collegiate', address: '2619 Niagara River Parkway', city: 'Fort Erie', postalCode: 'L2A5M4', phone: '905-871-6980', website: 'www.niagaracc.com', gradeRange: '6-12', governmentId: '879755', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Hillcrest Christian School', address: '195 Frobisher Drive', city: 'Waterloo', postalCode: 'N2V2C8', phone: '519-884-4834', website: 'www.hillcrestchristian.ca', gradeRange: 'JK-8', governmentId: '882155', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Laurel Creek Christian School', address: '145 Frobisher Drive', city: 'Waterloo', postalCode: 'N2V2C8', phone: '519-884-4834', website: 'www.laurelcreekchristian.ca', gradeRange: 'JK-8', governmentId: '885461', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Durham Christian Academy', address: '28 King Street East', city: 'Bowmanville', postalCode: 'L1C1N3', phone: '905-623-7795', website: 'www.durhamchristian.ca', gradeRange: 'JK-8', governmentId: '882023', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Khalsa Community School', address: '42 Carrier Drive', city: 'Toronto', postalCode: 'M9W5R1', phone: '416-670-9988', website: 'www.khalsacommunityschool.com', gradeRange: 'JK-8', governmentId: '882627', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Sikh' },
      { name: 'Khalsa School Toronto', address: '120 Saddlecreek Court', city: 'Brampton', postalCode: 'L6X5L3', phone: '905-789-7254', website: 'www.khalsaschool.ca', gradeRange: 'JK-8', governmentId: '881201', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Sikh' },
      { name: 'Islamic Foundation School', address: '441 Nugget Avenue', city: 'Scarborough', postalCode: 'M1S5E1', phone: '416-609-5555', website: 'www.islamicfoundation.ca', gradeRange: 'JK-8', governmentId: '880775', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Islamic' },
      { name: 'ISNA Islamic School', address: '2200 South Sheridan Way', city: 'Mississauga', postalCode: 'L5J2M4', phone: '905-403-8402', website: 'www.isnaschool.ca', gradeRange: 'JK-8', governmentId: '880965', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Islamic' },
      { name: 'Al-Azhar Islamic Academy', address: '130 Beverly Hills Drive', city: 'Toronto', postalCode: 'M3L1A3', phone: '416-249-0005', website: 'www.alazharacademy.com', gradeRange: 'JK-8', governmentId: '882361', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Islamic' },
      { name: 'Tawhid Islamic School', address: '195 Milvan Drive', city: 'Toronto', postalCode: 'M9L1Z9', phone: '416-748-5565', website: 'www.tawhidschool.ca', gradeRange: 'JK-8', governmentId: '883378', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Islamic' },
      { name: 'Associated Hebrew Schools', address: '252 Finch Avenue West', city: 'Toronto', postalCode: 'M2R1M7', phone: '416-494-7666', website: 'www.ahschools.com', gradeRange: 'JK-8', governmentId: '879375', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Bialik Hebrew Day School', address: '2760 Bathurst Street', city: 'Toronto', postalCode: 'M6B3A3', phone: '416-783-3346', website: 'www.bialik.ca', gradeRange: 'JK-8', governmentId: '879458', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Netivot HaTorah Day School', address: '18 Neptune Drive', city: 'Toronto', postalCode: 'M6A1X1', phone: '416-782-7379', website: 'www.netivothatorah.com', gradeRange: 'JK-8', governmentId: '881789', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Eitz Chaim Schools', address: '4600 Bathurst Street', city: 'Toronto', postalCode: 'M2R1W3', phone: '416-636-1880', website: 'www.eitzchaim.com', gradeRange: 'JK-8', governmentId: '879003', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Ner Israel Yeshiva College', address: '8950 Bathurst Street', city: 'Thornhill', postalCode: 'L4J8A7', phone: '905-731-1224', website: 'www.nerisrael.ca', gradeRange: '9-12', governmentId: '881516', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Leo Baeck Day School', address: '36 Atkinson Avenue', city: 'Thornhill', postalCode: 'L4J8C9', phone: '905-709-3636', website: 'www.leobaeck.ca', gradeRange: 'JK-8', governmentId: '881573', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Jewish' },
      { name: 'Humberside Montessori School', address: '37 Baby Point Road', city: 'Toronto', postalCode: 'M6S2G3', phone: '416-769-2411', website: 'www.humbersideschool.com', gradeRange: 'JK-6', governmentId: '880171', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Maria Montessori School', address: '300 Prince of Wales Drive', city: 'Ottawa', postalCode: 'K2C3N8', phone: '613-224-1918', website: 'www.mmstschool.com', gradeRange: 'JK-6', governmentId: '880296', programType: 'Montessori', religiousAffiliation: 'Non-denominational' },
      { name: 'Trillium School', address: '2300 Speers Road', city: 'Oakville', postalCode: 'L6L5M2', phone: '905-825-3506', website: 'www.trilliumschool.ca', gradeRange: 'JK-8', governmentId: '880189', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Havergal College Primary School', address: '1451 Avenue Road', city: 'Toronto', postalCode: 'M5N2H9', phone: '416-483-3519', website: 'www.havergal.on.ca', gradeRange: 'JK-6', governmentId: '880346', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Non-denominational' },
      { name: 'Guelph Community Christian School', address: '195 College Avenue West', city: 'Guelph', postalCode: 'N1G1S6', phone: '519-824-8860', website: 'www.gccs.ca', gradeRange: 'JK-8', governmentId: '880833', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Peterborough Christian School', address: '480 Pido Road', city: 'Peterborough', postalCode: 'K9J6X7', phone: '705-742-3527', website: 'www.pcsonline.ca', gradeRange: 'JK-8', governmentId: '881045', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Cornwall Christian Academy', address: '521 Tollgate Road', city: 'Cornwall', postalCode: 'K6H5R6', phone: '613-932-0100', website: 'www.cornwallchristianacademy.ca', gradeRange: 'JK-8', governmentId: '882569', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' },
      { name: 'Sudbury Christian Academy', address: '1629 Regent Street', city: 'Sudbury', postalCode: 'P3E3Z7', phone: '705-522-1153', website: 'www.sudburychristianacademy.ca', gradeRange: 'JK-8', governmentId: '882734', programType: 'Academic, broad based curriculum', religiousAffiliation: 'Christian' }
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