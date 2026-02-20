import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { message, conversationHistory } = await req.json();

    const msgLower = message.toLowerCase();
    
    // Extract intent via keyword matching
    let intent = 'SHOW_SCHOOLS'; // default
    let shouldShowSchools = true;
    let filterCriteria = {};
    let comparisonSchoolNames = [];
    
    // Compare intent
    if (msgLower.includes('compare') || msgLower.includes(' vs ') || msgLower.includes('versus') || 
        msgLower.includes('side by side') || msgLower.includes('side-by-side')) {
      intent = 'COMPARE_SCHOOLS';
      shouldShowSchools = false;
      
      // Extract school names for comparison
      let cleanedMessage = message
        .replace(/^compare\s+/i, '')
        .replace(/\s+(with|and|vs|versus|to|side\s*by\s*side)\s+/gi, '|')
        .trim();
      comparisonSchoolNames = cleanedMessage.split('|').map(n => n.trim()).filter(n => n.length > 3);
    }
    // Narrow down intent
    else if (msgLower.includes('narrow') || msgLower.includes('filter') || msgLower.includes('only show')) {
      intent = 'NARROW_DOWN';
      shouldShowSchools = false;
    }
    // Pure greetings
    else if (/^(hi|hello|hey|greetings|good morning|good afternoon)[\s!.]*$/i.test(msgLower.trim())) {
      intent = 'NO_ACTION';
      shouldShowSchools = false;
    }
    // SEARCH_SCHOOLS intent - when user is actively looking for schools
    else if (msgLower.includes('show') || msgLower.includes('find') || msgLower.includes('search') ||
             msgLower.includes('schools in') || msgLower.includes('schools near') ||
             msgLower.includes('private school') || msgLower.includes('looking for')) {
      intent = 'SEARCH_SCHOOLS';
      shouldShowSchools = true;
    }
    
    // Extract filter criteria using regex/string matching
    // City extraction
    const cityMatch = message.match(/\b(?:in|near|at|around)\s+([A-Z][a-zA-Z\s]+?)(?:\s*,|\s+(?:ontario|bc|quebec|california|new york)|$)/i) ||
                     message.match(/\b(Toronto|Vancouver|Montreal|Calgary|Edmonton|Ottawa|Victoria|Winnipeg|Hamilton|Quebec City|London|Kitchener|Halifax|Oakville|Burlington|Richmond Hill|Markham|Mississauga)\b/i);
    if (cityMatch) filterCriteria.city = cityMatch[1].trim();
    
    // Province/State extraction
    const provinceMatch = message.match(/\b(Ontario|British Columbia|BC|Quebec|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|PEI|California|New York|Texas|Florida)\b/i);
    if (provinceMatch) filterCriteria.provinceState = provinceMatch[1];
    
    // Region extraction
    const regionMatch = message.match(/\b(Canada|US|USA|United States|Europe|GTA|Greater Toronto|Lower Mainland|Greater Vancouver)\b/i);
    if (regionMatch) filterCriteria.region = regionMatch[1];
    
    // Curriculum extraction
    const curriculumMatch = message.match(/\b(Montessori|IB|International Baccalaureate|Waldorf|AP|Advanced Placement|Traditional)\b/i);
    if (curriculumMatch) {
      let curr = curriculumMatch[1];
      if (curr.toLowerCase().includes('international')) curr = 'IB';
      if (curr.toLowerCase().includes('advanced')) curr = 'AP';
      filterCriteria.curriculumType = curr;
    }
    
    // Grade extraction
    const gradeMatch = message.match(/\bgrade\s*(\d+)\b/i) || message.match(/\b(\d+)(?:th|st|nd|rd)\s*grade\b/i);
    if (gradeMatch) filterCriteria.grade = parseInt(gradeMatch[1]);
    
    // Specializations
    if (msgLower.includes('stem')) filterCriteria.specializations = ['STEM'];
    else if (msgLower.includes('arts')) filterCriteria.specializations = ['Arts'];
    else if (msgLower.includes('sports')) filterCriteria.specializations = ['Sports'];
    
    // FIX #2: GENDER FILTERING
    let genderPreference = null;
    if (msgLower.includes(' son') || msgLower.includes('boy') || msgLower.includes('boys')) {
      genderPreference = 'boy';
    } else if (msgLower.includes(' daughter') || msgLower.includes('girl') || msgLower.includes('girls')) {
      genderPreference = 'girl';
    }
    if (genderPreference) {
      filterCriteria.genderPreference = genderPreference;
    }
    
    return Response.json({
      intent,
      shouldShowSchools,
      filterCriteria,
      comparisonSchoolNames
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});