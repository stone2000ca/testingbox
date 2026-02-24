import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check admin auth
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = {
      archived: [],
      updated: [],
      skipped: [],
      errors: []
    };

    // 1. ARCHIVE 5 invalid schools
    const schoolsToArchive = [
      'Colonel Gray High School',
      'Kingswood University',
      'Oak Park High School',
      'Kelvin High School',
      'Lakecrest-St. John\'s'
    ];

    for (const schoolName of schoolsToArchive) {
      try {
        const schools = await base44.asServiceRole.entities.School.filter({ name: schoolName });
        if (schools.length > 0) {
          await base44.asServiceRole.entities.School.update(schools[0].id, {
            status: 'archived'
          });
          results.archived.push(schoolName);
        } else {
          results.skipped.push(`Archive: ${schoolName} not found`);
        }
      } catch (error) {
        results.errors.push(`Archive ${schoolName}: ${error.message}`);
      }
    }

    // 2. UPDATE 23 valid schools with enrichment data
    const enrichmentData = [
      // Batch 1
      {
        id: "69994fc92bafeec5d056488d",
        address: "58 Patrick Street, St. John's, NL A1E 2S7",
        phone: "709-726-0024",
        email: "info@lakecrest.ca",
        website: "https://www.lakecrest.ca",
        founded: 1993,
        enrollment: 150,
        curriculumType: "IB",
        gradesServed: "K-9",
        lowestGrade: 0,
        highestGrade: 9,
        languageOfInstruction: "English",
        accreditations: ["IB World School"],
        religiousAffiliation: "Non-denominational",
        boardingAvailable: false
      },
      {
        id: "69994fc9d92c6b7d8e86d1df",
        address: "2A Bonaventure Ave, St. John's, NL A1C 6B3",
        phone: "709-726-0024",
        email: "info@stbons.ca",
        website: "https://stbons.ca",
        founded: 1857,
        enrollment: 360,
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Catholic",
        boardingAvailable: false
      },
      {
        id: "69994fca2bafeec5d0564893",
        address: "945 Tower Road, Halifax, NS B3H 2Y2",
        phone: "902-422-6497",
        email: "admissions@halifaxgrammar.ca",
        website: "https://www.halifaxgrammar.ca",
        founded: 1958,
        enrollment: 600,
        curriculumType: "IB",
        gradesServed: "JP-12",
        lowestGrade: -1,
        highestGrade: 12,
        languageOfInstruction: "English",
        accreditations: ["CAIS", "IB World School"],
        boardingAvailable: false
      },
      {
        id: "69994fca4b76c8c9eb92f693",
        address: "5820 Spring Garden Rd, Halifax, NS",
        phone: "902-422-4459",
        email: "info@shsh.ca",
        website: "https://www.shsh.ca",
        founded: 1849,
        enrollment: 400,
        curriculumType: "AP",
        gradesServed: "JP-12",
        lowestGrade: -1,
        highestGrade: 12,
        religiousAffiliation: "Catholic",
        accreditations: ["CAIS"],
        boardingAvailable: false
      },
      {
        id: "69994fca5fe5a92c0199e43b",
        address: "1400 Oxford Street, Halifax, NS B3H 3Y8",
        phone: "902-423-9811",
        email: "info@armbrae.ns.ca",
        website: "https://armbrae.ns.ca",
        founded: 1887,
        enrollment: 300,
        curriculumType: "Traditional",
        gradesServed: "Pre-12",
        lowestGrade: -2,
        highestGrade: 12,
        accreditations: ["CAIS"],
        boardingAvailable: false
      },
      // Batch 2
      {
        id: "69994fca758416d863f69838",
        address: "3331 Connaught Avenue, Halifax, NS B3L 3B4",
        phone: "902-423-9777",
        website: "https://halifaxindependentschool.ca",
        founded: 2000,
        enrollment: 120,
        curriculumType: "Traditional",
        gradesServed: "JK-9",
        lowestGrade: -1,
        highestGrade: 9,
        boardingAvailable: false
      },
      {
        id: "69994fca8b2b73ee374a5843",
        address: "33 King's-Edgehill Lane, Windsor, NS B0N 2T0",
        phone: "902-798-2278",
        email: "kesinfo@kes.ns.ca",
        website: "https://www.kes.ns.ca",
        founded: 1788,
        enrollment: 375,
        curriculumType: "IB",
        gradesServed: "6-12",
        lowestGrade: 6,
        highestGrade: 12,
        boardingAvailable: true,
        accreditations: ["CAIS", "IB World School", "NAIS"]
      },
      {
        id: "69994fcaa572719a770339a0",
        address: "6225 Chebucto Road, Halifax, NS B3L 1K7",
        phone: "902-429-9067",
        email: "admin@maritimemuslimacademy.ca",
        website: "https://maritimemuslimacademy.ca",
        founded: 1984,
        enrollment: 150,
        curriculumType: "Traditional",
        gradesServed: "Pre-12",
        lowestGrade: -2,
        highestGrade: 12,
        religiousAffiliation: "Islamic",
        languageOfInstruction: "English",
        boardingAvailable: false
      },
      {
        id: "69994fcace63567831d1eb96",
        address: "40 College Hill Road, Rothesay, NB E2E 5H1",
        phone: "506-848-0859",
        email: "info@rns.cc",
        website: "https://www.rns.cc",
        founded: 1877,
        enrollment: 285,
        curriculumType: "Traditional",
        gradesServed: "6-12",
        lowestGrade: 6,
        highestGrade: 12,
        boardingAvailable: true,
        accreditations: ["CAIS", "NAIS"]
      },
      {
        id: "69994fcae21f73602f305f42",
        address: "45 Chapman Drive, Sussex, NB E4E 1M4",
        phone: "506-433-4005",
        email: "info@sussexchristianschool.ca",
        website: "https://www.sussexchristianschool.ca",
        founded: 1982,
        enrollment: 100,
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Christian",
        boardingAvailable: false
      },
      {
        id: "69994fcb0789725f46337a71",
        address: "1500 Royal Street, Regina, SK S4T 5A5",
        phone: "306-791-9150",
        website: "https://www.luthercollege.edu/highschool",
        founded: 1913,
        enrollment: 420,
        curriculumType: "Traditional",
        gradesServed: "9-12",
        lowestGrade: 9,
        highestGrade: 12,
        boardingAvailable: true,
        religiousAffiliation: "Lutheran"
      },
      {
        id: "69994fcb1c9f408ce819f796",
        address: "102 Pinehouse Drive, Saskatoon, SK S7K 5H7",
        phone: "306-242-7141",
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Christian",
        boardingAvailable: false
      },
      {
        id: "69994fcb2d88667c40e53a31",
        address: "102 Pinehouse Drive, Saskatoon, SK S7K 5H7",
        phone: "306-242-5086",
        email: "info@legacyacademy.ca",
        website: "https://www.legacychristian-academy.com",
        founded: 1982,
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Christian",
        boardingAvailable: false
      },
      {
        id: "69994fcb42f65a4430e3bb4f",
        address: "2505 23rd Avenue, Regina, SK S4S 7K7",
        phone: "306-775-0919",
        email: "office@myrcs.org",
        website: "https://www.reginachristianschool.org",
        founded: 2003,
        enrollment: 600,
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Christian",
        boardingAvailable: false
      },
      // Batch 3
      {
        id: "69994fcb57c7931c81ef0319",
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        religiousAffiliation: "Christian",
        city: "Swift Current",
        provinceState: "Saskatchewan",
        boardingAvailable: false
      },
      {
        id: "69994fcb6dd6164966952864",
        curriculumType: "Traditional",
        gradesServed: "9-12",
        lowestGrade: 9,
        highestGrade: 12,
        boardingAvailable: true,
        city: "Weyburn",
        provinceState: "Saskatchewan"
      },
      {
        id: "69994fcb8334469a770339d2",
        address: "400 South Drive, Winnipeg, MB R3T 3K5",
        phone: "204-477-2400",
        email: "info@sjr.mb.ca",
        website: "https://www.sjr.mb.ca",
        founded: 1820,
        enrollment: 897,
        curriculumType: "AP",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        boardingAvailable: true,
        accreditations: ["CAIS", "NAIS"]
      },
      {
        id: "69994fcb99946445582f6e72",
        address: "630 Westminster Ave, Winnipeg, MB R3C 3S1",
        phone: "204-784-1600",
        email: "info@balmoralhall.ca",
        website: "https://www.balmoralhall.com",
        founded: 1901,
        enrollment: 471,
        curriculumType: "Traditional",
        gradesServed: "K-12",
        lowestGrade: 0,
        highestGrade: 12,
        boardingAvailable: true,
        genderPolicy: "All-Girls",
        schoolType: "Day School"
      },
      {
        id: "69994fcbaed83e1c071725b8",
        address: "173 Talbot Avenue, Winnipeg, MB R2L 0P6",
        phone: "204-667-8210",
        email: "info@mbci.mb.ca",
        website: "https://mbci.mb.ca",
        founded: 1945,
        curriculumType: "Traditional",
        gradesServed: "5-12",
        lowestGrade: 5,
        highestGrade: 12,
        religiousAffiliation: "Mennonite",
        boardingAvailable: false
      },
      {
        id: "69994fcbbd3a77864f1d6438",
        address: "86 West Gate, Winnipeg, MB R3C 2E1",
        phone: "204-775-7111",
        email: "westgate@westgatemennonite.org",
        website: "https://westgatemennonite.ca",
        founded: 1958,
        curriculumType: "Traditional",
        gradesServed: "7-12",
        lowestGrade: 7,
        highestGrade: 12,
        religiousAffiliation: "Mennonite",
        boardingAvailable: false
      },
      {
        id: "69994fcbd25251ed7d337a78",
        address: "550 Wellington Crescent, Winnipeg, MB R3M 0C1",
        phone: "204-477-0244",
        email: "inquiries@smamb.ca",
        website: "https://smamb.ca",
        founded: 1869,
        enrollment: 600,
        curriculumType: "Traditional",
        gradesServed: "7-12",
        lowestGrade: 7,
        highestGrade: 12,
        genderPolicy: "All-Girls",
        religiousAffiliation: "Catholic",
        boardingAvailable: false
      },
      {
        id: "69994fcc1044439c23d1ebdf",
        address: "100 Keish Street, Suite 101, Whitehorse, YT Y1A 0N9",
        phone: "867-456-7100",
        email: "Admin@montessoriborealis.com",
        website: "https://yukonmontessori.com",
        curriculumType: "Montessori",
        gradesServed: "Pre-6",
        lowestGrade: -2,
        highestGrade: 6,
        boardingAvailable: false
      },
      {
        id: "69994fcc228816c70ed1ebf3",
        address: "55 Wann Road, Whitehorse, YT Y1A 5X4",
        phone: "867-667-3500",
        email: "hfes@yukon.ca",
        website: "http://hfe.yukonschools.ca",
        curriculumType: "Traditional",
        gradesServed: "K-7",
        lowestGrade: 0,
        highestGrade: 7,
        religiousAffiliation: "Catholic",
        boardingAvailable: false
      }
    ];

    // Update each school
    for (const enrichment of enrichmentData) {
      try {
        const schoolId = enrichment.id;
        
        // Prepare update data
        const updateData = { ...enrichment };
        delete updateData.id; // Remove id from update payload
        
        // Set importBatchId
        updateData.importBatchId = 'CA-ENRICHMENT-2026';
        
        // Set schoolType based on boardingAvailable
        if (enrichment.boardingAvailable === true) {
          updateData.schoolType = 'Boarding School';
        } else if (enrichment.boardingAvailable === false) {
          // Only set to Day School if not already specified
          if (!enrichment.schoolType) {
            updateData.schoolType = 'Day School';
          }
        }
        
        // Update the school
        await base44.asServiceRole.entities.School.update(schoolId, updateData);
        results.updated.push(schoolId);
      } catch (error) {
        results.errors.push(`Update ${enrichment.id}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      summary: {
        archived: results.archived.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      details: results
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});