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
    lowest = parseInt(range[0].trim()) || null;
    highest = parseInt(range[1].trim()) || null;
  }
  
  return { lowestGrade: lowest, highestGrade: highest };
};

const mapGenderPolicy = (genderStr) => {
  const gender = genderStr?.trim().toLowerCase();
  if (gender === 'boys') return 'All-Boys';
  if (gender === 'girls') return 'All-Girls';
  if (gender === 'co-ed') return 'Co-ed';
  return 'Co-ed';
};

const mapBoardingType = (boardingStr) => {
  const boarding = boardingStr?.trim().toLowerCase();
  if (boarding === 'boarding') return 'full';
  if (boarding === 'day') return 'day';
  if (boarding === 'day/boarding') return 'weekly';
  return null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const importBatchId = `uk_isc_gias_${Date.now()}`;

    // 50 UK independent schools data
    const schoolsData = [
      { name: 'Eton College', address: 'Windsor', postalCode: 'SL4 6DW', county: 'Berkshire', phone: '01753-671000', website: 'www.etoncollege.com', gradeRange: '13-18', gender: 'Boys', boarding: 'Boarding' },
      { name: 'Harrow School', address: '5 High Street, Harrow on the Hill', postalCode: 'HA1 3HP', county: 'London', phone: '020-8872-8000', website: 'www.harrowschool.org.uk', gradeRange: '13-18', gender: 'Boys', boarding: 'Boarding' },
      { name: 'Winchester College', address: 'College Street, Winchester', postalCode: 'SO23 9NA', county: 'Hampshire', phone: '01962-621100', website: 'www.winchestercollege.org', gradeRange: '13-18', gender: 'Boys', boarding: 'Boarding' },
      { name: 'Westminster School', address: 'Little Dean\'s Yard', postalCode: 'SW1P 3PF', county: 'London', phone: '020-7963-1000', website: 'www.westminster.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Day/Boarding' },
      { name: 'St Paul\'s School', address: 'Lonsdale Road, Barnes', postalCode: 'SW13 9JT', county: 'London', phone: '020-8748-9162', website: 'www.stpaulsschool.org.uk', gradeRange: '13-18', gender: 'Boys', boarding: 'Day' },
      { name: 'Dulwich College', address: 'Dulwich Common', postalCode: 'SE21 7LD', county: 'London', phone: '020-8693-3601', website: 'www.dulwich.org.uk', gradeRange: '7-18', gender: 'Boys', boarding: 'Day/Boarding' },
      { name: 'Rugby School', address: 'Lawrence Sheriff Street, Rugby', postalCode: 'CV22 5EH', county: 'Warwickshire', phone: '01788-556216', website: 'www.rugbyschool.co.uk', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Charterhouse', address: 'Godalming', postalCode: 'GU7 2DX', county: 'Surrey', phone: '01483-291501', website: 'www.charterhouse.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Cheltenham Ladies\' College', address: 'Bayshill Road, Cheltenham', postalCode: 'GL50 3EP', county: 'Gloucestershire', phone: '01242-520691', website: 'www.cheltladiescollege.org', gradeRange: '11-18', gender: 'Girls', boarding: 'Boarding' },
      { name: 'Wycombe Abbey', address: 'High Wycombe', postalCode: 'HP11 1PE', county: 'Buckinghamshire', phone: '01494-897008', website: 'www.wycombeabbey.com', gradeRange: '11-18', gender: 'Girls', boarding: 'Boarding' },
      { name: 'Tonbridge School', address: 'High Street, Tonbridge', postalCode: 'TN9 1JP', county: 'Kent', phone: '01732-365555', website: 'www.tonbridge-school.co.uk', gradeRange: '13-18', gender: 'Boys', boarding: 'Boarding' },
      { name: 'Marlborough College', address: 'Bath Road, Marlborough', postalCode: 'SN8 1PA', county: 'Wiltshire', phone: '01672-892200', website: 'www.marlboroughcollege.org', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Oundle School', address: 'Church Street, Oundle', postalCode: 'PE8 4GH', county: 'Northamptonshire', phone: '01832-277100', website: 'www.oundleschool.org.uk', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Wellington College', address: 'Duke\'s Ride, Crowthorne', postalCode: 'RG45 7PU', county: 'Berkshire', phone: '01344-820000', website: 'www.wellingtoncollege.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Brighton College', address: 'Eastern Road, Brighton', postalCode: 'BN2 0AL', county: 'East Sussex', phone: '01273-704200', website: 'www.brightoncollege.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Day/Boarding' },
      { name: 'King\'s College School', address: 'Southside, Wimbledon Common', postalCode: 'SW19 4TT', county: 'London', phone: '020-8255-5300', website: 'www.kcs.org.uk', gradeRange: '7-18', gender: 'Boys', boarding: 'Day' },
      { name: 'City of London School', address: '107 Queen Victoria Street', postalCode: 'EC4V 3AL', county: 'London', phone: '020-7489-0291', website: 'www.cityoflondonschool.org.uk', gradeRange: '10-18', gender: 'Boys', boarding: 'Day' },
      { name: 'Highgate School', address: 'North Road, Highgate', postalCode: 'N6 4AY', county: 'London', phone: '020-8340-1524', website: 'www.highgateschool.org.uk', gradeRange: '3-18', gender: 'Co-ed', boarding: 'Day' },
      { name: 'North London Collegiate School', address: 'Canons, Canons Drive, Edgware', postalCode: 'HA8 7RJ', county: 'London', phone: '020-8952-0912', website: 'www.nlcs.org.uk', gradeRange: '4-18', gender: 'Girls', boarding: 'Day' },
      { name: 'Manchester Grammar School', address: 'Old Hall Lane, Manchester', postalCode: 'M13 0XT', county: 'Greater Manchester', phone: '0161-224-7201', website: 'www.mgs.org', gradeRange: '7-18', gender: 'Boys', boarding: 'Day' },
      { name: 'King Edward\'s School Birmingham', address: 'Edgbaston Park Road', postalCode: 'B15 2UA', county: 'West Midlands', phone: '0121-472-1672', website: 'www.kes.org.uk', gradeRange: '11-18', gender: 'Boys', boarding: 'Day' },
      { name: 'Sevenoaks School', address: 'High Street, Sevenoaks', postalCode: 'TN13 1HU', county: 'Kent', phone: '01732-455133', website: 'www.sevenoaksschool.org', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Day/Boarding' },
      { name: 'Ampleforth College', address: 'Ampleforth, York', postalCode: 'YO62 4ER', county: 'North Yorkshire', phone: '01439-766000', website: 'www.ampleforth.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Stowe School', address: 'Stowe, Buckingham', postalCode: 'MK18 5EH', county: 'Buckinghamshire', phone: '01280-818000', website: 'www.stowe.co.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Benenden School', address: 'Cranbrook', postalCode: 'TN17 4AA', county: 'Kent', phone: '01580-240592', website: 'www.benenden.school', gradeRange: '11-18', gender: 'Girls', boarding: 'Boarding' },
      { name: 'Repton School', address: 'Repton, Derby', postalCode: 'DE65 6FH', county: 'Derbyshire', phone: '01283-559222', website: 'www.repton.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Uppingham School', address: 'High Street West, Uppingham', postalCode: 'LE15 9QE', county: 'Rutland', phone: '01572-822216', website: 'www.uppingham.co.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Shrewsbury School', address: 'The Schools, Shrewsbury', postalCode: 'SY3 7BA', county: 'Shropshire', phone: '01743-280500', website: 'www.shrewsbury.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Gordonstoun', address: 'Elgin', postalCode: 'IV30 5RF', county: 'Moray', phone: '01343-837837', website: 'www.gordonstoun.org.uk', gradeRange: '8-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Fettes College', address: 'Carrington Road, Edinburgh', postalCode: 'EH4 1QX', county: 'Edinburgh', phone: '0131-332-2281', website: 'www.fettes.com', gradeRange: '7-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'George Heriot\'s School', address: 'Lauriston Place, Edinburgh', postalCode: 'EH3 9EQ', county: 'Edinburgh', phone: '0131-229-7263', website: 'www.george-heriots.com', gradeRange: '4-18', gender: 'Co-ed', boarding: 'Day' },
      { name: 'The High School of Glasgow', address: '637 Crow Road, Glasgow', postalCode: 'G13 1PL', county: 'Glasgow', phone: '0141-954-9628', website: 'www.thehighschoolofglasgow.co.uk', gradeRange: '3-18', gender: 'Co-ed', boarding: 'Day' },
      { name: 'Glenalmond College', address: 'Perth', postalCode: 'PH1 3RY', county: 'Perthshire', phone: '01738-842000', website: 'www.glenalmondcollege.co.uk', gradeRange: '12-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Christ\'s Hospital', address: 'Horsham', postalCode: 'RH13 0LJ', county: 'West Sussex', phone: '01403-211293', website: 'www.christs-hospital.org.uk', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Millfield School', address: 'Street', postalCode: 'BA16 0YD', county: 'Somerset', phone: '01458-442291', website: 'www.millfieldschool.com', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Radley College', address: 'Abingdon', postalCode: 'OX14 2HR', county: 'Oxfordshire', phone: '01235-543000', website: 'www.radley.org.uk', gradeRange: '13-18', gender: 'Boys', boarding: 'Boarding' },
      { name: 'Canford School', address: 'Wimborne', postalCode: 'BH21 3AD', county: 'Dorset', phone: '01202-847207', website: 'www.canford.com', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Epsom College', address: 'College Road, Epsom', postalCode: 'KT17 4JQ', county: 'Surrey', phone: '01372-821000', website: 'www.epsomcollege.org.uk', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Day/Boarding' },
      { name: 'Bradfield College', address: 'Bradfield, Reading', postalCode: 'RG7 6AU', county: 'Berkshire', phone: '0118-964-4500', website: 'www.bradfieldcollege.org.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Abingdon School', address: 'Park Road, Abingdon', postalCode: 'OX14 1DE', county: 'Oxfordshire', phone: '01235-521563', website: 'www.abingdon.org.uk', gradeRange: '11-18', gender: 'Boys', boarding: 'Day' },
      { name: 'Lancing College', address: 'Lancing', postalCode: 'BN15 0RW', county: 'West Sussex', phone: '01273-452213', website: 'www.lancingcollege.co.uk', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Blundell\'s School', address: 'Tiverton', postalCode: 'EX16 4DN', county: 'Devon', phone: '01884-252543', website: 'www.blundells.org', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Cranleigh School', address: 'Horseshoe Lane, Cranleigh', postalCode: 'GU6 8QQ', county: 'Surrey', phone: '01483-273666', website: 'www.cranleigh.org', gradeRange: '13-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Haileybury', address: 'Hertford', postalCode: 'SG13 7NU', county: 'Hertfordshire', phone: '01992-706200', website: 'www.haileybury.com', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Boarding' },
      { name: 'Bromsgrove School', address: 'Worcester Road, Bromsgrove', postalCode: 'B61 7DU', county: 'Worcestershire', phone: '01527-579679', website: 'www.bromsgrove-school.co.uk', gradeRange: '7-18', gender: 'Co-ed', boarding: 'Day/Boarding' },
      { name: 'Alleyn\'s School', address: 'Townley Road, Dulwich', postalCode: 'SE22 8SU', county: 'London', phone: '020-8557-1500', website: 'www.alleyns.org.uk', gradeRange: '4-18', gender: 'Co-ed', boarding: 'Day' },
      { name: 'James Allen\'s Girls\' School', address: '144 East Dulwich Grove', postalCode: 'SE22 8TE', county: 'London', phone: '020-8693-1181', website: 'www.jags.org.uk', gradeRange: '4-18', gender: 'Girls', boarding: 'Day' },
      { name: 'Latymer Upper School', address: 'King Street, Hammersmith', postalCode: 'W6 9LR', county: 'London', phone: '020-8741-1851', website: 'www.latymer-upper.org', gradeRange: '11-18', gender: 'Co-ed', boarding: 'Day' },
      { name: 'Haberdashers\' Boys\' School', address: 'Butterfly Lane, Elstree', postalCode: 'WD6 3AF', county: 'Hertfordshire', phone: '020-8266-1700', website: 'www.habsboys.org.uk', gradeRange: '4-18', gender: 'Boys', boarding: 'Day' },
      { name: 'Godolphin and Latymer School', address: 'Iffley Road, Hammersmith', postalCode: 'W6 0PG', county: 'London', phone: '020-8741-1936', website: 'www.godolphinandlatymer.com', gradeRange: '11-18', gender: 'Girls', boarding: 'Day' }
    ];

    // Transform schools with required fields
    const schools = schoolsData.map(school => {
      const { lowestGrade, highestGrade } = parseGradeRange(school.gradeRange);
      const boardingType = mapBoardingType(school.boarding);
      
      return {
        name: school.name,
        slug: generateSlug(school.name),
        address: school.address,
        city: school.address.split(',')[0] || school.address,
        provinceState: school.county,
        country: 'United Kingdom',
        region: school.county?.includes('London') || school.county === 'Edinburgh' || school.county === 'Glasgow' ? 'United Kingdom' : 'United Kingdom',
        postalCode: school.postalCode,
        phone: school.phone,
        website: school.website,
        email: '',
        lowestGrade,
        highestGrade,
        dataSource: 'uk_isc_gias',
        governmentId: '',
        schoolType: school.boarding === 'Boarding' ? 'Boarding School' : 'Day School',
        genderPolicy: mapGenderPolicy(school.gender),
        boardingAvailable: school.boarding !== 'Day',
        boardingType: boardingType,
        gradeSystem: 'uk',
        status: 'active',
        importBatchId,
        verified: false,
        missionStatement: `Top independent school in ${school.county}`
      };
    });

    console.log(`Importing ${schools.length} UK schools...`);

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

          // Check if school already exists (by slug and county/city)
          const matches = await base44.asServiceRole.entities.School.filter({
            slug: school.slug,
            provinceState: school.provinceState
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