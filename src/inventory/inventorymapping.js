
import { db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  getDoc,
  doc
} from "firebase/firestore";

import { addConsumptionLedgerEntry } from "../inventory-command-center/utils/consumptionledger";


export const testToReagentMap = {
  "ALBUMIN,SERUM": { name: "ALBUMIN/5 PACK/90 SLIDES", qty: 1 },
  "ALKALINE PHOSPHATASE,SERUM": { name: "ALKP/5 PACK/300SLIDES", qty: 1 },
  "BLOOD UREA,SERUM": { name: "BUN/5 PACK/300 SLIDES", qty: 1 },
  "CHLORIDE,SERUM": { name: "CL/5 PACK/250 SLIDES", qty: 1 },
  "CREATININE,SERUM": { name: "CREATININE/5 PACK/300 SLIDES", qty: 1 },
  "CHOLESTEROL,SERUM": { name: "CHOLESTROL /5 PACK/300 SLIDES", qty: 1 },
  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE)": { name: "CRP/5 PACK/90 SLIDES", qty: 1 },
  "DIRECT LDL CHOLESTROL,SERUM": { name: "HDL/5 PACK/90 SLIDES", qty: 1 },
  "G.G.T(GAMMA GLUTAMYL TRANSFERASE,SERUM)": { name: "GGT/5 PACK/250 SLIDES", qty: 1 },
  "GLYCOSYLATED HEMOGLOBIN(HbA1c)": { name: "A1C SLIDES - 250 SLIDES", qty: 1 },
  "HDL CHOLESTROL,SERUM": { name: "HDL/5 PACK/90 SLIDES", qty: 1 },
  "IRON,SERUM": { name: "IRON/5 PACK/90 SLIDES", qty: 1 },
  "LACTATE DEHYDROGENASE,SERUM": { name: "LDH/5 PACK/250 SLIDES", qty: 1 },
  "POTASSIUM,SERUM": { name: "POTASSIUM/K+/5 PACK/250 SLIDES", qty: 1 },
  "PHOSPHORUS,SERUM": { name: "PHOSPHORUS/5 PACK/300 SLIDES", qty: 1 },
  "SGOT(ASPARTATE AMINOTRANSFERASE,SERUM)": { name: "AST/5 PACK/300 SLIDES", qty: 1 },
  "SGPT(ALANINE AMINOTRANSFERASE,SERUM)": { name: "ALT/5 PACK/300 SLIDES", qty: 1 },
  "SODIUM,SERUM": { name: "SODIUM/Na+/5 PACK/250 SLIDES", qty: 1 },
  "TOTAL PROTEIN,SERUM": { name: "TOTAL PROTEIN/5 PACK/90 SLIDES", qty: 1 },
  "TRIGLYCERIDES,SERUM": { name: "TRIGLYCERIDES/5 PACK/90 SLIDES", qty: 1 },
  "TIBC": { name: "DTIBC REAGENT BOX/ 300 TEST", qty: 1 },
  "URIC ACID, SERUM": { name: "URIC ACID/5 PACK/300 SLIDES", qty: 1 },
  "TOTAL CALCIUM,SERUM": { name: "CALCIUM/5 PACK/300 SLIDES", qty: 1 },
  "BLOOD GLUCOSE OGT": { name: "GLUCOSE/5 PACK/300 SLIDES", qty: 1 },
  "GLUCOSE FASTING,PLASMA": { name: "GLUCOSE/5 PACK/300 SLIDES", qty: 1 },
  "GLUCOSE POST - PRANDIAL( P.P. ),PLASMA": { name: "GLUCOSE/5 PACK/300 SLIDES", qty: 1 },
  "GLUCOSE RANDOM,PLASMA": { name: "GLUCOSE/5 PACK/300 SLIDES", qty: 1 },

  "BILIRUBIN(TOTAL,DIRECT & INDIRECT),SERUM": [
    { name: "TOT BILIRUBIN/5 PACK/300 SLIDES", qty: 1 },
    { name: "BUBC/5 PACK/300 SLIDES (DIRECT AND INDIRECT BILIRUBIN)", qty: 1 }
  ],

  "ELECTROLYTES,SERUM": [
    { name: "SODIUM/Na+/5 PACK/250 SLIDES", qty: 1 },
    { name: "POTASSIUM/K+/5 PACK/250 SLIDES", qty: 1 },
    { name: "CL/5 PACK/250 SLIDES", qty: 1 },
  ],

  "LIPID PROFILE": [
      { name: "CHOLESTROL /5 PACK/300 SLIDES", qty: 1 },
      { name: "TRIGLYCERIDES/5 PACK/90 SLIDES", qty: 1 },
      { name: "HDL/5 PACK/90 SLIDES", qty: 1 }
    ],
  

  "LFT (LIVER FUNCTION TEST)": {
    "GENERAL": [
      { name: "TOT BILIRUBIN/5 PACK/300 SLIDES", qty: 1 },
      { name: "BUBC/5 PACK/300 SLIDES (DIRECT AND INDIRECT BILIRUBIN)", qty: 1 },
      { name: "AST/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALT/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALKP/5 PACK/300SLIDES", qty: 1 },
      { name: "TOTAL PROTEIN/5 PACK/90 SLIDES", qty: 1 },
      { name: "ALBUMIN/5 PACK/90 SLIDES", qty: 1 },
      { name: "GGT/5 PACK/250 SLIDES", qty: 1 },
      { name: "LDH/5 PACK/250 SLIDES", qty: 1 },
    ],
    "RGHS": [
      { name: "TOT BILIRUBIN/5 PACK/300 SLIDES", qty: 1 },
      { name: "BUBC/5 PACK/300 SLIDES (DIRECT AND INDIRECT BILIRUBIN)", qty: 1 },
      { name: "AST/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALT/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALKP/5 PACK/300SLIDES", qty: 1 },
      { name: "ALBUMIN/5 PACK/90 SLIDES", qty: 1 },
    ],
    "OTHER": [
      { name: "TOT BILIRUBIN/5 PACK/300 SLIDES", qty: 1 },
      { name: "BUBC/5 PACK/300 SLIDES (DIRECT AND INDIRECT BILIRUBIN)", qty: 1 },
      { name: "AST/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALT/5 PACK/300 SLIDES", qty: 1 },
      { name: "ALKP/5 PACK/300SLIDES", qty: 1 },
    ],


  },

  "RFT(RENAL FUNCTION TEST)": {
    "GENERAL": [
      { name: "BUN/5 PACK/300 SLIDES", qty: 1 },
      { name: "CREATININE/5 PACK/300 SLIDES", qty: 1 },
      { name: "URIC ACID/5 PACK/300 SLIDES", qty: 1 },
      { name: "CL/5 PACK/250 SLIDES", qty: 1 },
      { name: "SODIUM/Na+/5 PACK/250 SLIDES", qty: 1 },
      { name: "POTASSIUM/K+/5 PACK/250 SLIDES", qty: 1 },
      { name: "PHOSPHORUS/5 PACK/300 SLIDES", qty: 1 },
    ],
    "RGHS": [
      { name: "BUN/5 PACK/300 SLIDES", qty: 1 },
      { name: "CREATININE/5 PACK/300 SLIDES", qty: 1 },
      { name: "SODIUM/Na+/5 PACK/250 SLIDES", qty: 1 },
      { name: "POTASSIUM/K+/5 PACK/250 SLIDES", qty: 1 },
    ],

    "OTHER": [
      { name: "BUN/5 PACK/300 SLIDES", qty: 1 },
      { name: "CREATININE/5 PACK/300 SLIDES", qty: 1 },
      { name: "POTASSIUM/K+/5 PACK/250 SLIDES", qty: 1 },
    ],

  },

  "T3": { name: "TOT T3 / 100 WELLS", qty: 1 },
  "T4": { name: "TOT T4 / 100 WELLS", qty: 1 },
  "TSH (THYROID STIMULATING HORMONE)": { name: "TSH3 REAGENT/ 100 WELLS", qty: 1 },
  "FT4 (FREE THYROXINE)": { name: "FREE T4 / 100 WELLS", qty: 1 },
  "PROLACTIN": { name: "PROLACTIN / 100 WELLS", qty: 1 },
  "PROGESTERONE": { name: "PROGESTERONE/ 100 WELLS", qty: 1 },
  "VITAMIN B12 LEVEL": { name: "B12 100 WELLS", qty: 1 },
  "VITAMIN D25 (OH) TOTAL": { name: "25 OH VITAMIN D / TOTAL 100", qty: 1 },
  "FERRITIN": { name: "FERRITIN/ 100 WELLS", qty: 1 },
  "HIV I & II (QUANTITATIVE)": { name: "VITR HIV CMBO RGT PK (NONUS 100 WELLS)", qty: 1 },
  "HBSAG": { name: "VITROS HBSAG / 100 WELLS", qty: 1 },
  "BETA-HCG (HUMAN CHORIONIC GONADOTROPIN)": { name: "TOT B-hCG / 100 WELLS", qty: 1 },
  "FOLATE": { name: "FOLATE 100 WELLS", qty: 1 },
  "PSA": { name: "TOTAL PSA 100 WELLS", qty: 1 },
  "HCV (SERUM)": { name: "ECI HCV 100 WELLS", qty: 1 },
  "TROP-T": { name: "HS TROP REAGENT 100 WELLS", qty: 1 },
  "TROPONIN I": { name: "HS TROPONIN I REAGENT 100 WELLS", qty: 1 },

  "ALBUMIN,SERUM - BACKUP": { name: "Yumizen CS Albumin", qty: 1 },
  "ALKALINE PHOSPHATASE,SERUM - BACKUP": { name: "Yumizen CS ALP", qty: 1 },
  "AMYLASE,SERUM - BACKUP": { name: "Yumizen CS AMYLASE", qty: 1 },
  "BLOOD GLUCOSE OGT - BACKUP": { name: "Yumizen CS GLUCOSE", qty: 1 },
  "BLOOD UREA,SERUM - BACKUP": { name: "Yumizen CS Urea/Bun (UV) 125 ML Total", qty: 1 },
  "CHOLESTEROL,SERUM - BACKUP": { name: "Yumizen CS CHOLESTROL", qty: 1 },
  "CREATININE,SERUM - BACKUP": { name: "Yumizen CS CREATININE", qty: 1 },
  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE) - BACKUP": { name: "Yumizen CS CRP (50 ML)", qty: 1 },
  "G.G.T(GAMMA GLUTAMYL TRANSFERASE,SERUM) - BACKUP": { name: "Yumizen CS G.G.T", qty: 1 },
  "GLUCOSE FASTING,PLASMA - BACKUP": { name: "Yumizen CS GLUCOSE", qty: 1 },
  "GLUCOSE POST - PRANDIAL( P.P. ),PLASMA - BACKUP": { name: "Yumizen CS GLUCOSE", qty: 1 },
  "GLUCOSE RANDOM,PLASMA - BACKUP": { name: "Yumizen CS GLUCOSE", qty: 1 },
  "LACTATE DEHYDROGENASE,SERUM - BACKUP": { name: "Yumizen CS LDH", qty: 1 },
  "ORAL GLUCOSE TOLERANCE TEST(OGTT) - BACKUP": { name: "Yumizen CS GLUCOSE", qty: 1 },
  "PHOSPHORUS,SERUM - BACKUP": { name: "Yumizen CS PHOSPHORUS", qty: 1 },
  "RHEUMATOID FACTOR QUANTITATIVE,SERUM - BACKUP": { name: "Yumizen CS RF", qty: 1 },
  "SGOT(ASPARTATE AMINOTRANSFERASE,SERUM) - BACKUP": { name: "Yumizen CS SGOT", qty: 1 },
  "SGPT(ALANINE AMINOTRANSFERASE,SERUM) - BACKUP": { name: "Yumizen CS SGPT", qty: 1 },
  "TOTAL PROTEIN,SERUM - BACKUP": { name: "Yumizen CS TOTAL PROTEIN", qty: 1 },
  "TRIGLYCERIDES,SERUM - BACKUP": { name: "Yumizen CS TRIGLYCERIDES", qty: 1 },
  "URIC ACID, SERUM - BACKUP": { name: "Yumizen CS URIC ACID", qty: 1 },

  "BILIRUBIN(TOTAL,DIRECT & INDIRECT),SERUM - BACKUP": [
    { name: "Yumizen CS Bilirubin Direct 125 Ml Total", qty: 1 },
    { name: "Yumizen CS Bilirubin Total 125 Ml Total", qty: 1 }
  ],

  "LIPID PROFILE - BACKUP": [
      { name: "Yumizen CS CHOLESTROL", qty: 1 },
      { name: "Yumizen CS TRIGLYCERIDES", qty: 1 },
      { name: "Yumizen CS DIRECT LDL", qty: 1 },
      { name: "Yumizen CS HDL", qty: 1 },
    ],
  

  "LFT (LIVER FUNCTION TEST) - BACKUP": {
    "GENERAL": [
      { name: "Yumizen CS Bilirubin Direct 125 Ml Total", qty: 1 },
      { name: "Yumizen CS Bilirubin Total 125 Ml Total", qty: 1 },
      { name: "Yumizen CS SGOT", qty: 1 },
      { name: "Yumizen CS SGPT", qty: 1 },
      { name: "Yumizen CS ALP", qty: 1 },
      { name: "Yumizen CS TOTAL PROTEIN", qty: 1 },
      { name: "Yumizen CS Albumin", qty: 1 },
      { name: "Yumizen CS LDH", qty: 1 },
      { name: "Yumizen CS G.G.T", qty: 1 }
    ],


    "RGHS": [
      { name: "Yumizen CS Bilirubin Total 125 Ml Total", qty: 1 },
      { name: "Yumizen CS Bilirubin Direct 125 Ml Total", qty: 1 },
      { name: "Yumizen CS SGOT", qty: 1 },
      { name: "Yumizen CS SGPT", qty: 1 },
      { name: "Yumizen CS ALP", qty: 1 },
      { name: "Yumizen CS Albumin", qty: 1 },
    ],
    "OTHER": [
      { name: "Yumizen CS Bilirubin Total 125 Ml Total", qty: 1 },
      { name: "Yumizen CS Bilirubin Direct 125 Ml Total", qty: 1 },
      { name: "Yumizen CS SGOT", qty: 1 },
      { name: "Yumizen CS SGPT", qty: 1 },
      { name: "Yumizen CS ALP", qty: 1 },
    ],
  },


  "RFT(RENAL FUNCTION TEST) - BACKUP": {
    "GENERAL": [
      { name: "Yumizen CS Urea/Bun (UV) 125 ML Total", qty: 1 },
      { name: "Yumizen CS CREATININE", qty: 1 },
      { name: "Yumizen CS URIC ACID", qty: 1 },
      { name: "Yumizen CS PHOSPHORUS", qty: 1 },
      { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
    ],
      
      "RGHS": [
        { name: "Yumizen CS Urea/Bun (UV) 125 ML Total", qty: 1 },
        { name: "Yumizen CS CREATININE", qty: 1 },
        { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
      ],
  
      "OTHER": [
        { name: "Yumizen CS Urea/Bun (UV) 125 ML Total", qty: 1 },
        { name: "Yumizen CS CREATININE", qty: 1 },
        { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
      ],
      },

  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE) - MISPA": { name: "AGAPPE CRP 30 TEST", qty: 1 },
  "GLYCOSYLATED HEMOGLOBIN(HbA1c) - MISPA": { name: "AGAPPE HBA1C 30 TEST", qty: 1 },
  "RHEUMATOID FACTOR QUANTITATIVE,SERUM - MISPA": { name: "AGAPPE RF 30 TEST", qty: 1 },

  "ELECTROLYTES,SERUM - GEM 3500": { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
  "SODIUM,SERUM - GEM 3500": { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
  "POTASSIUM,SERUM - GEM 3500": { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
  "CHLORIDE,SERUM - GEM 3500": { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },
  "CALCIUM IONISED - GEM 3500": { name: "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM", qty: 1 },

  // --- HAEMATOLOGY 3-PART MAPPINGS ---
  "haemogram_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  "hb haemoglobin_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  "lamellar body count_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],

  "hematocrit_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  
  "red blood cell count_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  
  "total leucocytic count_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  
  "differential leucocytic count_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  
  "platelet count_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],
  
  "red blood cell indices_three_part": [
    { name: "ABX MINIDIL 10 LTR", qty: 1 },
    { name: "ABX LYSBIO 400 ML", qty: 1 },
    { name: "ABX MINICLEAN 1 LTR", qty: 1 }
  ],


  // --- HAEMATOLOGY 5-PART MAPPINGS ---
  "haemogram_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  "hb haemoglobin_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  "lamellar body count_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],

  "hematocrit_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  
  "red blood cell count_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  
  "total leucocytic count_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  
  "differential leucocytic count_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  
  "platelet count_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],
  
  "red blood cell indices_five_part": [
    { name: "ABX WHITEDIFF 1 LTR", qty: 1 },
    { name: "ABX DILUENT 20 LTR", qty: 1 },
    { name: "ABX CLEANER 1 LTR", qty: 1 }
  ],


  // --- COAGULATION ---

  "APTT (ACT PARTIAL THROMBO PLASTIN TIME)": [
    { name: "Yumizen G APTT 4", qty: 1 },
    { name: "Yumizen G CACL 2", qty: 1 },
  ],

  "PROTHOMBIN TIME (PT-INR),PLASMA": { name: "Yumizen G PT 5 ", qty: 1 },
  
  "BLEEDING TIME (B.T.)": { name: "BT/CT CAPILARY 100", qty: 1 },

  "CLOTTING TIME (C.T.)": { name: "BT/CT CAPILARY 100", qty: 1 },

  "COAGULATION PROFILE": [
    { name: "Yumizen G APTT 4", qty: 1 },
    { name: "Yumizen G CACL 2", qty: 1 },
    { name: "Yumizen G PT 5 ", qty: 1 },
    { name: "BT/CT CAPILARY 100", qty: 1 }
  ],

// --- SEROLOGY ---

"HBSAG CARD": { name: "HEPACARD HBSAG", qty: 1 },

"HCV (SERUM) CARD": { name: "HCV TRIDOT J.MITRA", qty: 1 },

"HIV I & II (QUANTITATIVE) CARD": { name: "HIV TRI DOT J.MITRA", qty: 1 },
"VDRL (SERUM)": { name: "SYPHILLIS RAPID TEST STRIP ASPEN 50 TEST", qty: 1 },
"OCCULT BLOOD": { name: "HAEMTEST OCCULT BLOOD KIT", qty: 1 },

// --- RAPID CARD ---

"MALARIA ANTIGEN DETECTION CARD , BLOOD": { name: "F SATYA 2.0 MALARIA CARD", qty: 1 },

"DENGUE IGG , IGM & NS 1 ANTIGEN": { name: "DENGUE DAY 1 100 TESTS", qty: 1 },

"TROP-T CARD": { name: "TROP-T SENSITIVE (LAXMI DISTRIBUTORS).", qty: 1 },
"TYPHOID IGG , IGM": { name: "TYPHOID IGG / IGM 30 TEST", qty: 1 },
"CHIKUNGUNIA IGM": { name: "CHICKUNGUNYA IGM J.MITRA 10 TEST", qty: 1 },

// --- URINE ---

"URINE FOR ALBUMIN": { name: "URINE STRIPS", qty: 1 },

"URINE FOR BILE PIGMENTS": { name: "URINE STRIPS", qty: 1 },

"URINE FOR BILE SALTS": { name: "URINE STRIPS", qty: 1 },

"URINE FOR KETONE BODIES": { name: "KETO DIASTIX", qty: 1 },

"URINE FOR SUGAR": { name: "URINE STRIPS", qty: 1 },

"PREGNANCY TEST": { name: "PREGNANCY CARD", qty: 1 },

"URINE ANALYSIS": [
  { name: "URINE STRIPS", qty: 1 },
  { name: "KETO DIASTIX", qty: 1 },
]


};

export const getVitrosDeductibleTests = async (
  selectedTests = []
) => {

  const deductibleTests = [];

  for (const testName of selectedTests) {

    try {

      const adjustmentRef = doc(
        db,
        "inventory_adjustments",
        testName
      );

      const adjustmentSnap =
        await getDoc(adjustmentRef);

      if (!adjustmentSnap.exists()) {

        deductibleTests.push(testName);
        continue;
      }

      const adjustment =
        adjustmentSnap.data();

      const analyzer =
        adjustment?.analyzer || "VITROS";

      if (analyzer === "VITROS") {
        deductibleTests.push(testName);
      }

    } catch (err) {

      console.error(
        "Inventory Adjustment Check Error:",
        err
      );

      // fail-safe
      deductibleTests.push(testName);
    }
  }

  return deductibleTests;
};


export const handleInventoryDeduction = async (relevantTests, category = "GENERAL") => {
  console.time("TOTAL INVENTORY DEDUCTION");
  if (!relevantTests || relevantTests.length === 0) return;

  const batch = writeBatch(db);
  const inventoryRef = collection(db, "inventory_logs");
  const catKey = category.toUpperCase();

  let targetDeductions = [];

  relevantTests.forEach(testName => {
    const normalize = (s = "") =>
  s.toUpperCase()
    .replace(/[\s,._()-]+/g, "")
    .trim();

const mappingKey = Object.keys(testToReagentMap).find(
  key => normalize(key) === normalize(testName)
);

let mapping = testToReagentMap[mappingKey];
    if (!mapping) return;

    if (
      mapping.GENERAL ||
      mapping.RGHS ||
      mapping.OTHER
    ) {
      mapping = mapping[catKey] || mapping["GENERAL"];
    }

    const items = Array.isArray(mapping) ? mapping : [mapping];

    items.forEach(item => {
      if (typeof item === "string" && item !== "") {
        targetDeductions.push({
          name: item,
          qty: 1,
          sourceTest: testName
        });
      }
      
      else if (item && item.name) {
        targetDeductions.push({
          name: item.name,
          qty: item.qty || 1,
          sourceTest: testName
        });
      }
    });
  });

  const normalize = (s = "") =>
  s.toUpperCase()
    .replace(/[\s,._()-]+/g, "")
    .trim();

  const q = query(
    inventoryRef,
    where("status", "==", "Activated")
  );
  
  const querySnapshot = await getDocs(q);
  const inventoryMap = new Map();

querySnapshot.docs.forEach(docSnap => {
  const data = docSnap.data();

  const normalizedName =
    (data.reagentName || "")
      .toUpperCase()
      .replace(/[\s,._()-]+/g, "")
      .trim();

  inventoryMap.set(normalizedName, {
    docSnap,
    data
  });
});



  for (const item of targetDeductions) {
 
    try {
      
      if (querySnapshot.empty) {
        console.warn(`[Inventory] No active record for: ${item.name}`);
        continue;
      }

      const match = inventoryMap.get(
        normalize(item.name)
      );
      
      if (!match) {
        console.warn(
          `[Inventory] No active record for: ${item.name}`
        );
        continue;
      }
      
      const { docSnap, data } = match;
      
      const currentTests = Number(data.totalTests) || 0;


        const initialCapacity = Number(data.totalAvailable) || 1;

        if (currentTests > 0) {
          const newTotal = Math.max(0, currentTests - item.qty);
          const newHealth = Math.round((newTotal / initialCapacity) * 100);

          batch.update(doc(db, "inventory_logs", docSnap.id), {
            totalTests: newTotal,
            health: newHealth,
            status: newTotal <= 0 ? "Consumed" : "Activated"
          });

          await addConsumptionLedgerEntry({
            productName: data.reagentName,

            batchNo:
            data.lotNo ||
            data.batchNo ||
            "N/A",

            boxNo: data.boxNo || "",

          
            machine: data.machineName || "N/A",
          
            inventoryType: "Reagent",

            metricType:
            data.metricType || "",
          
            testName: item.sourceTest,
          
            actionType: "Consumed",
          
            qty: item.qty
          });

        
      }
    } catch (err) {
      console.error(`Error deducting ${item.name}:`, err);
    }
  }
  console.timeEnd("TOTAL INVENTORY DEDUCTION");
  await batch.commit();
};