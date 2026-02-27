
import DEPT_TEST_ROUTING from "./testRoutingMap.json";

export const getCountByTest = (entries, deptKey) => {
  const counts = {};
  const masterTests = DEPT_TEST_ROUTING[deptKey] || [];

  if (masterTests.length === 0) {
    console.error(`DEBUG: No tests found in JSON for key: "${deptKey}"`);
  }

  // Initialize tests to 0
  masterTests.forEach(test => {
    counts[test.toUpperCase().trim()] = 0;
  });

  entries.forEach(entry => {
    if (entry.selectedTests) {
      entry.selectedTests.forEach(testItem => {
        const testName = (typeof testItem === 'string' 
          ? testItem 
          : testItem.test || "").toUpperCase().trim();
          
        if (counts.hasOwnProperty(testName)) {
          counts[testName]++;
        }
      });
    }
  });

  // Log the data to your browser console (F12)
  console.log(`--- Stats for ${deptKey} ---`);
  console.table(counts); 

  return counts;
};