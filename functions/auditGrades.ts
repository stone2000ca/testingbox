import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Fetch all schools (high limit to get everything)
    const schools = await base44.asServiceRole.entities.School.list('-created_date', 1000);
    
    // Group by gradeFrom value
    const gradeDistribution = {};
    const allGrades = new Set();
    
    schools.forEach(school => {
      const gradeFrom = school.lowestGrade ?? 'null';
      const gradeTo = school.highestGrade ?? 'null';
      
      allGrades.add(gradeFrom);
      allGrades.add(gradeTo);
      
      if (!gradeDistribution[gradeFrom]) {
        gradeDistribution[gradeFrom] = {
          count: 0,
          schools: [],
          uniqueGradeTo: new Set()
        };
      }
      
      gradeDistribution[gradeFrom].count++;
      gradeDistribution[gradeFrom].schools.push({
        name: school.name,
        lowestGrade: school.lowestGrade,
        highestGrade: school.highestGrade,
        gradesDisplay: `${school.lowestGrade}-${school.highestGrade}`
      });
      gradeDistribution[gradeFrom].uniqueGradeTo.add(gradeTo);
    });
    
    // Convert Sets to Arrays for JSON serialization
    const result = {
      totalSchools: schools.length,
      allUniqueGrades: Array.from(allGrades).sort((a, b) => a - b),
      gradeDistribution: {}
    };
    
    Object.keys(gradeDistribution).sort((a, b) => a - b).forEach(gradeFrom => {
      result.gradeDistribution[gradeFrom] = {
        count: gradeDistribution[gradeFrom].count,
        uniqueGradeTo: Array.from(gradeDistribution[gradeFrom].uniqueGradeTo).sort((a, b) => a - b),
        schoolExamples: gradeDistribution[gradeFrom].schools.slice(0, 3)
      };
    });
    
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});