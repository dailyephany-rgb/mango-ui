
import React, { useState, useRef, useEffect } from "react";
import "./mango.css";
import { db } from "./firebaseConfig.js";
import testMapping from "./test_mapping.json";
import { collection, serverTimestamp, setDoc, doc } from "firebase/firestore";
import { trackedGetDoc as getDoc } from "./shared/firestore/trackedFirestore.js";
import UserMenu from "./auth/UserMenu";


export default function Mango() {

  const departments = Object.keys(testMapping).map((label) => ({
    key: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
    label,
  }));

 
  const allTests = departments.flatMap((d) =>
    (testMapping[d.label] || []).map((test) => ({
      dept: d.label,
      test,
    }))
  );

  const doctorOptions = [
    "Dr. Anil Sharma",
    "Dr. Renu Makwana",
    "Dr. Sanjay Makwana",
    "Dr. Kapil Kumar Raheja",
    "Dr. Vivek Lakhawat",
    "Sanjeev Sanghvi",
    "Dr. Akhil Govil",
    "Dr. Jitendra Chouhan",
    "Dr. Jitendra Khetawat",
    "Dr. Ashish Joshi",
    "RMO (Redidential Medical Officer)",
    "Dr. Ashok Bishnoi",
    "Consultant Gynaecology",
    "Consultant ART",
    "Consultant Paediatrician",
    "Consultant Orthopaedic",
    "Dr. Vinod Shaily",
    "Dr. Dabi",
    "Dr. Saurabh Kuvera",
    "Dr. Pravesh Vyas",
    "Dr. Neha Agarwal",
    "Dr. Jyotsana Sharma",
    "Dr. Lalit Mohan Rathi",
    "Dr. Amit Singhvi",
    "Dr. Consultant Obstretrics",
  ];

 

  const normalizeDoctorName = (value) => {
    return String(value || "")
      .toLowerCase()
      // Remove common doctor/title words
      .replace(/\bdr\b/g, "")
      .replace(/\bdoctor\b/g, "")
      .replace(/\bconsultant\b/g, "")
      // Remove punctuation
      .replace(/[.,/()\-_:]/g, " ")
      // Collapse spaces
      .replace(/\s+/g, " ")
      .trim();
  };
  
  const findMatchingDoctor = (qrDoctor) => {
    if (!qrDoctor) return "";
  
    const normalizedQRDoctor = normalizeDoctorName(qrDoctor);
  
    if (!normalizedQRDoctor) return "";
  
    // First: exact normalized match
    const exactMatch = doctorOptions.find(
      (doctor) =>
        normalizeDoctorName(doctor) === normalizedQRDoctor
    );
  
    if (exactMatch) {
      return exactMatch;
    }
  
    // Second: allow the QR to contain an additional title/
    // descriptor while still matching the doctor's full name.
    const fuzzyMatch = doctorOptions.find((doctor) => {
      const normalizedOption = normalizeDoctorName(doctor);
  
      return (
        normalizedOption.includes(normalizedQRDoctor) ||
        normalizedQRDoctor.includes(normalizedOption)
      );
    });
  
    return fuzzyMatch || "";
  };

  const nameRef = useRef();
  const fatherRef = useRef();
  const doctorRef = useRef();
  const categoryRef = useRef();
  const sourceRef = useRef();
  const regRef = useRef();
  const diagnosticRef = useRef();
  const datePrintedRef = useRef();
  const timePrintedRef = useRef();
  const ageRef = useRef();
  const ageUnitRef = useRef();
  const genderRef = useRef();
  const phoneRef = useRef();
  const searchRef = useRef();
  const selectedTestsRef = useRef();
  const resultRefs = useRef([]);

  const qrInputRef = useRef();
const qrBufferRef = useRef("");
const qrScanTimerRef = useRef(null);
const qrScanningRef = useRef(false);

  // Helper for date string - UPDATED TO IST (Asia/Kolkata)
  const getTodayDateStr = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  const [formData, setFormData] = useState({
    source: "OPD",
    regNo: "",
    diagnosticNo: "",
    datePrinted: getTodayDateStr(),
    timePrinted: "",
    name: "",
    father: "",
    age: "",
    ageUnit: "years",
    gender: "M",
    phone: "",
    doctor: "",
    category: "",
    tests: {},
    expandedDept: {},
    selectedTests: [],
    urgent: false,
  });

  const [errors, setErrors] = useState({});
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isEditMode, setIsEditMode] = useState(false);
  // NEW: Store the original ID to prevent creating new entries on update
  const [originalId, setOriginalId] = useState(null);

  useEffect(() => {
    if (focusedIndex >= 0 && resultRefs.current[focusedIndex]) {
      resultRefs.current[focusedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [focusedIndex]);

  useEffect(() => {
    qrInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const editDataRaw = localStorage.getItem("editPatientData");
    if (editDataRaw) {
      const editData = JSON.parse(editDataRaw);
      let timeStr = "";
      let dateStr = getTodayDateStr();

      if (editData.timePrinted) {
        const d = editData.timePrinted.seconds 
          ? new Date(editData.timePrinted.seconds * 1000) 
          : new Date(editData.timePrinted);
        timeStr = d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
        // Update dateStr using IST for consistency
        dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      }
      setFormData({ ...editData, timePrinted: timeStr, datePrinted: dateStr, expandedDept: {} });
      setIsEditMode(true);
      // Set the original ID so we update the correct document
      setOriginalId(editData.id || `${editData.regNo}_${editData.diagnosticNo}`);
      localStorage.removeItem("editPatientData");
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: false }));
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const findDepartment = (testName) => {
    for (const dept in testMapping) {
      if (testMapping[dept].includes(testName)) {
        return dept;
      }
    }
  
    return null;
  };

  const processQRData = (rawData) => {
    try {
      // ---------------------------------------------------------
      // 1. Clean scanner payload
      // ---------------------------------------------------------
      const scannedText = String(rawData || "")
        .replace(/[\r\n\t]/g, " ")
        .trim();
  
      if (!scannedText) {
        console.warn("QR scan was empty.");
        return;
      }
  
      // ---------------------------------------------------------
      // 2. Parse JSON
      // ---------------------------------------------------------
      let qrData;
  
      try {
        qrData = JSON.parse(scannedText);
      } catch (jsonError) {
        console.error("QR JSON parse failed:", jsonError);
        console.log("Raw QR data:", scannedText);
        alert("QR code does not contain valid patient data.");
        return;
      }
  
      if (!qrData || typeof qrData !== "object" || Array.isArray(qrData)) {
        alert("Invalid patient QR data.");
        return;
      }
  
      console.log("RAW QR DATA:", qrData);
  
      // ---------------------------------------------------------
      // 3. Helper: find a value regardless of label formatting
      //
      // This allows:
      // "name"
      // "Name"
      // "patientName"
      // "Patient Name"
      // "patient_name"
      // "PATIENT NAME"
      // ---------------------------------------------------------
      const normalizeKey = (key) =>
        String(key || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
  
      const normalizedQR = {};
  
      Object.entries(qrData).forEach(([key, value]) => {
        normalizedQR[normalizeKey(key)] = value;
      });
  
      const getQRValue = (...possibleKeys) => {
        for (const key of possibleKeys) {
          const normalizedKey = normalizeKey(key);
  
          if (
            normalizedQR[normalizedKey] !== undefined &&
            normalizedQR[normalizedKey] !== null &&
            normalizedQR[normalizedKey] !== ""
          ) {
            return normalizedQR[normalizedKey];
          }
        }
  
        return "";
      };
  
      // ---------------------------------------------------------
      // 4. Read every Mango field from the QR
      // ---------------------------------------------------------
  
      const regNo = getQRValue(
        "regNo",
        "RegNo",
        "registrationNo",
        "registrationNumber",
        "registration",
        "Reg. No.",
        "Reg No"
      );
  
      const diagnosticNo = getQRValue(
        "diagnosticNo",
        "DiagnosticNo",
        "diagnosticNumber",
        "diagnostic",
        "diagnostic no",
        "Diagnostic No."
      );
  
      const name = getQRValue(
        "name",
        "patientName",
        "patient name",
        "Patient Name"
      );
  
      const father = getQRValue(
        "father",
        "fatherName",
        "father name",
        "husband",
        "husbandName",
        "father / husband",
        "Father / Husband"
      );
  
      const age = getQRValue(
        "age",
        "patientAge",
        "patient age"
      );
  
      const ageUnit = getQRValue(
        "ageUnit",
        "age unit",
        "ageUnitType"
      ) || "years";
  
      const genderRaw = getQRValue(
        "gender",
        "sex",
        "patientGender"
      );
  
      const phone = getQRValue(
        "phone",
        "phoneNumber",
        "mobile",
        "mobileNumber",
        "contact",
        "contactNumber"
      );
  
      const doctorRaw = getQRValue(
        "doctor",
        "doctorName",
        "doctor name",
        "consultant",
        "consultantName",
        "doctor / consultant"
      );
  
      const category = getQRValue(
        "category",
        "patientCategory",
        "billingCategory"
      );
  
      const source = getQRValue(
        "source",
        "patientSource",
        "registrationSource"
      ) || "OPD";
  
      const datePrinted = getQRValue(
        "datePrinted",
        "date printed",
        "printedDate",
        "printDate"
      ) || getTodayDateStr();
  
      const timePrinted = getQRValue(
        "timePrinted",
        "time printed",
        "printedTime",
        "printTime"
      );
  
      const urgentRaw = getQRValue(
        "urgent",
        "isUrgent",
        "priority"
      );
  
      // ---------------------------------------------------------
      // 5. Normalize gender
      // ---------------------------------------------------------
      let gender = "M";
  
      if (genderRaw !== "") {
        const g = String(genderRaw).trim().toLowerCase();
  
        if (
          g === "f" ||
          g === "female" ||
          g === "woman" ||
          g === "girl"
        ) {
          gender = "F";
        } else if (
          g === "m" ||
          g === "male" ||
          g === "man" ||
          g === "boy"
        ) {
          gender = "M";
        }
      }
  
      // ---------------------------------------------------------
      // 6. Normalize age unit
      // ---------------------------------------------------------
      let normalizedAgeUnit = "years";
  
      const unit = String(ageUnit).trim().toLowerCase();
  
      if (unit.startsWith("month")) {
        normalizedAgeUnit = "months";
      } else if (unit.startsWith("day")) {
        normalizedAgeUnit = "days";
      } else {
        normalizedAgeUnit = "years";
      }
  
      // ---------------------------------------------------------
      // 7. Find exact doctor from Mango dropdown
      // ---------------------------------------------------------
      const matchedDoctor = findMatchingDoctor(doctorRaw);
  
      if (doctorRaw && !matchedDoctor) {
        console.warn(
          "QR doctor did not match a Mango doctor:",
          doctorRaw
        );
      }
  
      // ---------------------------------------------------------
      // 8. Read tests
      //
      // Supports:
      // ["CBC", "ESR"]
      //
      // and also:
      // "CBC, ESR"
      // ---------------------------------------------------------
      let qrTests = getQRValue(
        "tests",
        "test",
        "selectedTests",
        "selectedTest",
        "investigations",
        "investigation"
      );
  
      if (!Array.isArray(qrTests)) {
        if (typeof qrTests === "string" && qrTests.trim()) {
          qrTests = qrTests
            .split(",")
            .map((test) => test.trim())
            .filter(Boolean);
        } else {
          qrTests = [];
        }
      }
  
      // ---------------------------------------------------------
      // 9. Match QR tests against test_mapping.json
      // ---------------------------------------------------------
      const selectedTests = [];
  
      const unknownTests = [];
  
      qrTests.forEach((rawTest) => {
        const testName = String(rawTest || "").trim();
  
        if (!testName) return;
  
        // First try exact match
        let matchedTest = allTests.find(
          (item) =>
            item.test.toLowerCase() === testName.toLowerCase()
        );
  
        // Then try trimmed whitespace
        if (!matchedTest) {
          matchedTest = allTests.find(
            (item) =>
              item.test.trim().toLowerCase() ===
              testName.trim().toLowerCase()
          );
        }
  
        if (!matchedTest) {
          unknownTests.push(testName);
          return;
        }
  
        selectedTests.push({
          dept: matchedTest.dept,
          test: matchedTest.test,
        });
      });
  
      // Remove duplicate tests
      const uniqueSelectedTests = selectedTests.filter(
        (test, index, array) =>
          index ===
          array.findIndex(
            (t) =>
              t.dept === test.dept &&
              t.test === test.test
          )
      );
  
      if (unknownTests.length > 0) {
        console.warn(
          "QR tests not found in test_mapping.json:",
          unknownTests
        );
  
        alert(
          `These QR tests could not be mapped:\n\n${unknownTests.join(
            "\n"
          )}`
        );
      }
  
      // ---------------------------------------------------------
      // 10. Build the EXACT Mango form object
      // ---------------------------------------------------------
      const mappedFormData = {
        regNo: String(regNo ?? ""),
        diagnosticNo: String(diagnosticNo ?? ""),
  
        name: String(name ?? ""),
        father: String(father ?? ""),
  
        age: String(age ?? ""),
        ageUnit: normalizedAgeUnit,
        gender,
  
        phone: String(phone ?? ""),
  
        doctor: matchedDoctor,
  
        category: String(category ?? ""),
        source: String(source ?? ""),
  
        datePrinted: String(datePrinted ?? ""),
        timePrinted: String(timePrinted ?? ""),
  
        urgent:
          urgentRaw === true ||
          String(urgentRaw).toLowerCase() === "true" ||
          String(urgentRaw) === "1",
  
        selectedTests: uniqueSelectedTests,
      };
  
      // ---------------------------------------------------------
      // 11. Put everything into React state
      //
      // The existing controlled inputs will immediately display
      // these values exactly as though the user entered them.
      // ---------------------------------------------------------
      setFormData((prev) => ({
        ...prev,
        ...mappedFormData,
      }));
  
      // Clear validation errors for successfully mapped fields
      setErrors((prev) => {
        const next = { ...prev };
  
        Object.keys(mappedFormData).forEach((field) => {
          if (
            mappedFormData[field] !== "" &&
            mappedFormData[field] !== undefined
          ) {
            next[field] = false;
          }
        });
  
        if (uniqueSelectedTests.length > 0) {
          next.selectedTests = false;
        }
  
        return next;
      });
  
      console.log("=================================");
      console.log("QR → MANGO MAPPING SUCCESS");
      console.log("=================================");
      console.log("Reg No:", mappedFormData.regNo);
      console.log("Diagnostic No:", mappedFormData.diagnosticNo);
      console.log("Patient Name:", mappedFormData.name);
      console.log("Father/Husband:", mappedFormData.father);
      console.log("Age:", mappedFormData.age);
      console.log("Age Unit:", mappedFormData.ageUnit);
      console.log("Gender:", mappedFormData.gender);
      console.log("Phone:", mappedFormData.phone);
      console.log("Doctor:", mappedFormData.doctor);
      console.log("Category:", mappedFormData.category);
      console.log("Source:", mappedFormData.source);
      console.log("Date Printed:", mappedFormData.datePrinted);
      console.log("Time Printed:", mappedFormData.timePrinted);
      console.log("Tests:", mappedFormData.selectedTests);
      console.log("=================================");
  
    } catch (error) {
      console.error("QR processing error:", error);
      alert("Unable to process QR patient data.");
    }
  };

  useEffect(() => {
    const handleScannerKeyDown = (e) => {
      if (!qrScanningRef.current) return;

      // Scanner is active.
      // Prevent scanner keystrokes from reaching
      // Mango inputs or the browser.
      e.preventDefault();
      e.stopPropagation();

      // Enter and Tab are part of the QR payload.
      // Do NOT finish the scan here.
      if (e.key === "Enter" || e.key === "Tab") {
        qrBufferRef.current += "\n";
        return;
      }

      // Capture normal scanner characters.
      if (e.key.length === 1) {
        qrBufferRef.current += e.key;

        const data = qrBufferRef.current.trim();

        // Our QR payload is complete when the JSON
        // reaches its final closing brace.
        if (data.startsWith("{") && data.endsWith("}")) {
          console.timeEnd("QR_TOTAL_SCAN_TIME");
          console.log("QR SCAN COMPLETE");
          console.log("QR PAYLOAD LENGTH:", data.length);
        
          qrBufferRef.current = "";
          qrScanningRef.current = false;
        
          processQRData(data);
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleScannerKeyDown,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleScannerKeyDown,
        true
      );

      if (qrScanTimerRef.current) {
        clearTimeout(qrScanTimerRef.current);
      }
    };
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    setFocusedIndex(-1);
    if (!value.trim()) { setSearchResults([]); return; }
    const lower = value.toLowerCase();
    const results = allTests.filter((t) => t.test.toLowerCase().startsWith(lower));
    setSearchResults(results.slice(0, 50));
  };

  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = focusedIndex >= 0 ? searchResults[focusedIndex] : searchResults[0];
      if (item) handleSelectSearchTest(item.dept, item.test);
    }
  };

  const handleSelectSearchTest = (dept, test) => {
    setFormData((prev) => {
      const exists = prev.selectedTests.some((t) => t.dept === dept && t.test === test);
      if (exists) return prev;
      return { ...prev, selectedTests: [...prev.selectedTests, { dept, test }] };
    });
    setSearchText("");
    setSearchResults([]);
    setFocusedIndex(-1);
    searchRef.current?.focus();
  };

  const handleTestCheckbox = (dept, test, isChecked) => {
    setFormData((prev) => {
      if (isChecked) {
        if (!prev.selectedTests.some((t) => t.dept === dept && t.test === test)) {
          return { ...prev, selectedTests: [...prev.selectedTests, { dept, test }] };
        }
      } else {
        return { ...prev, selectedTests: prev.selectedTests.filter((t) => !(t.dept === dept && t.test === test)) };
      }
      return prev;
    });
  };

  const handleRemoveSelectedTest = (index) => {
    setFormData((prev) => {
      const newList = [...prev.selectedTests];
      newList.splice(index, 1);
      return { ...prev, selectedTests: newList };
    });
  };

  const toggleDept = (key) => {
    setFormData((prev) => ({
      ...prev,
      expandedDept: { ...prev.expandedDept, [key]: !prev.expandedDept[key] },
    }));
  };

  const goNext = (e, nextRef) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const validateForm = () => {
    const requiredFields = ["name", "father", "doctor", "category", "source", "regNo", "diagnosticNo", "age", "phone"];
    let newErrors = {};
    requiredFields.forEach((f) => { if (!formData[f]) newErrors[f] = true; });
    if (!formData.selectedTests?.length) newErrors.selectedTests = true;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      alert("❗ Please fill all required fields.");
      return;
    }
    const regNo = String(formData.regNo).trim();
    const diagNo = String(formData.diagnosticNo).trim();
    
    // Logic: If editing, use originalId. If new, create compositeId.
    const compositeId = isEditMode ? originalId : `${regNo}_${diagNo}`;
    const docRef = doc(db, "master_register", compositeId);

    const clearFormAndReset = () => {
        setFormData({
            source: "OPD", regNo: "", diagnosticNo: "", datePrinted: getTodayDateStr(), timePrinted: "",
            name: "", father: "", age: "", ageUnit: "years", gender: "M",
            phone: "", doctor: "", category: "", tests: {}, expandedDept: {}, selectedTests: [],
            urgent: false
        });
        setIsEditMode(false);
        setOriginalId(null);
        regRef.current?.focus();
    };

    try {
      // 1. Error on saving if duplicate exists (Only for new entries)
      if (!isEditMode) {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          alert(`❌ Error in saving entry: A record with Reg No: ${regNo} and Diag No: ${diagNo} already exists.`);
          clearFormAndReset(); // Forms becomes blank on duplicate
          return;
        }
      }

      const fullTimePrinted = formData.timePrinted
        ? (() => {
            const [h, m] = formData.timePrinted.split(":");
            const d = new Date(formData.datePrinted);
            d.setHours(Number(h)); d.setMinutes(Number(m)); d.setSeconds(0);
            return d;
          })()
        : new Date(formData.datePrinted);

      let finalTimeCollected;
      if (isEditMode && formData.timeCollected) {
        if (typeof formData.timeCollected.toDate === "function") {
          finalTimeCollected = formData.timeCollected.toDate();
        } else if (formData.timeCollected.seconds) {
          finalTimeCollected = new Date(formData.timeCollected.seconds * 1000);
        } else {
          finalTimeCollected = new Date(formData.timeCollected);
        }
      } else {
        finalTimeCollected = new Date();
      }

      const entryData = {
        ...formData,
        regNo,
        diagnosticNo: diagNo,
        receiptSavedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: fullTimePrinted,
        timeCollected: finalTimeCollected,
        urgent: formData.urgent || false,
        // Denormalized dept keys for Firestore queries (array-contains).
        // Derived from selectedTests[].dept — selectedTests shape unchanged.
        departments: [
          ...new Set(
            (formData.selectedTests || [])
              .map((t) => t?.dept)
              .filter(Boolean)
          ),
        ],
      };
      
      delete entryData.expandedDept; 
      delete entryData.tests; 
      delete entryData.id;
      delete entryData.datePrinted;

      // 2. Update existing or set new
      await setDoc(docRef, entryData, { merge: true });

     
// Create / Update Report Details
// ==============================

        const reportDocRef = doc(
          db,
          "report_details",
          compositeId
        );

        const reportSnap = await getDoc(reportDocRef);


        const reportDetailsEntry = {
          regNo,
          diagnosticNo: diagNo,

          name: formData.name,
          father: formData.father,
          age: formData.age,
          ageUnit: formData.ageUnit,
          gender: formData.gender,
          doctor: formData.doctor,
          phone: formData.phone,
          category: formData.category,
          source: formData.source,
          urgent: formData.urgent || false,

          selectedTests: formData.selectedTests,

          timePrinted: fullTimePrinted,
          timeCollected: finalTimeCollected,

          // Denormalized dept keys (same as master_register) for queries
          departments: entryData.departments,

          receiptSavedBy:
            sessionStorage.getItem("loggedUser") || "Unknown",
        };

        const routineDepartments = [
          "Bio-Chemistry",
          "Hormones",
          "Blood-Group",
          "Coagulation",
          "Haematology",
          "ESR",
          "Serology",
          "RapidCard",
          "Urine Examination",
        ];
        
        const insideLabDepartments = [
          "Clinical Pathology",
          "MicroBiology",
        ];
        
        const outsourceDepartments = [
          "STERLING",
          "NEUBERG",
          "LIFECELL",
          "LILAC",
          "RELIABLE",
        ];
        
        formData.selectedTests.forEach(({ dept }) => {
        
          // ---------- Routine ----------
          if (routineDepartments.includes(dept)) {
        
            reportDetailsEntry.routineReportsScanned ??= {};
            reportDetailsEntry.routineReportsSaved ??= {};
            reportDetailsEntry.routineReportsValidated ??= {};
            reportDetailsEntry.routineReportsEntered ??= {};
        
           
        
            return;
          }
        
          // ---------- Inside Lab ----------
          if (insideLabDepartments.includes(dept)) {
        
            reportDetailsEntry.insideLabReportsSaved ??= {};
        
           
        
            return;
          }
        
          // ---------- Outsource ----------
          if (outsourceDepartments.includes(dept)) {
        
            reportDetailsEntry.outsourceReportsCollected ??= {};
            reportDetailsEntry.outsourceReportsReceived ??= {};
            reportDetailsEntry.outsourceReportsDelivered ??= {};
        
            
          }
        });




    if (!reportSnap.exists()) {
      // First time creating report_details
      await setDoc(
        reportDocRef,
        reportDetailsEntry,
        { merge: true }
      );
    } else {
      // Update shared fields; preserve existing workflow progress maps.
      // Only seed empty workflow containers when the doc is missing that map.
      const existing = reportSnap.data() || {};
      const {
        routineReportsScanned,
        routineReportsSaved,
        routineReportsValidated,
        routineReportsEntered,
        insideLabReportsSaved,
        outsourceReportsCollected,
        outsourceReportsReceived,
        outsourceReportsDelivered,
        ...editReportDetails
      } = reportDetailsEntry;

      const workflowSeeds = {
        routineReportsScanned,
        routineReportsSaved,
        routineReportsValidated,
        routineReportsEntered,
        insideLabReportsSaved,
        outsourceReportsCollected,
        outsourceReportsReceived,
        outsourceReportsDelivered,
      };

      for (const [key, value] of Object.entries(workflowSeeds)) {
        if (value != null && existing[key] == null) {
          editReportDetails[key] = value;
        }
      }

      await setDoc(
        reportDocRef,
        editReportDetails,
        { merge: true }
      );
    }


      alert(`✅ Entry ${isEditMode ? "Updated" : "Saved"} successfully!`);
      
      clearFormAndReset();
      
    } catch (error) {
      console.error("Save Error:", error);
      alert(`❌ Error saving entry: ${error.message}`);
    }
  };

  return (
        <div className="mango-container">
        <header className="mango-header">
        <div className="mango-header-left">  
      <h1>Vasundhara Hospital Limited</h1>
    </div>
    <UserMenu />
    </header>

      <div className="mango-content">
        <div className="left-panel">
              <button
              className="scan-btn"
              onClick={() => {
                qrBufferRef.current = "";
                qrScanningRef.current = true;
              
                console.time("QR_TOTAL_SCAN_TIME");
                console.log("QR SCAN STARTED");
              
                qrInputRef.current?.focus();
              }}
          >
              📷 Scan QR
          </button>

                      <textarea
              ref={qrInputRef}
              readOnly
              tabIndex={-1}
              style={{
                position: "fixed",
                left: "-10000px",
                top: "-10000px",
                width: "1px",
                height: "1px",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
                


          <p className="or-text">or</p>
          
          <label>Source</label>
          <select ref={sourceRef} name="source" value={formData.source} onChange={handleInputChange} onKeyDown={(e) => goNext(e, regRef)}>
            <option value="OPD">OPD</option>
            <option value="IPD">IPD</option>
            <option value="Third Floor">Third Floor</option>
          </select>

          <label>Reg. No.</label>
          <input ref={regRef} name="regNo" className={errors.regNo ? "input-error" : ""} value={formData.regNo} onChange={handleInputChange} onKeyDown={(e) => goNext(e, diagnosticRef)} disabled={isEditMode} />
          
          <label>Diagnostic No.</label>
          <input ref={diagnosticRef} name="diagnosticNo" className={errors.diagnosticNo ? "input-error" : ""} value={formData.diagnosticNo} onChange={handleInputChange} onKeyDown={(e) => goNext(e, datePrintedRef)} disabled={isEditMode} />
          
          <label>🕓 Date & Time Printed</label>
          <div className="inline-input">
            <input type="date" ref={datePrintedRef} name="datePrinted" value={formData.datePrinted} onChange={handleInputChange} onKeyDown={(e) => goNext(e, timePrintedRef)} />
            <input type="time" ref={timePrintedRef} name="timePrinted" value={formData.timePrinted} onChange={handleInputChange} onKeyDown={(e) => goNext(e, ageRef)} />
          </div>
          
          <label>Age</label>
          <div className="inline-input">
            <input ref={ageRef} name="age" type="number" value={formData.age} onChange={handleInputChange} onKeyDown={(e) => goNext(e, ageUnitRef)} />
            <select ref={ageUnitRef} name="ageUnit" value={formData.ageUnit} onChange={handleInputChange} onKeyDown={(e) => goNext(e, genderRef)}>
              <option value="years">Years</option><option value="months">Months</option><option value="days">Days</option>
            </select>
            <select ref={genderRef} name="gender" value={formData.gender} onChange={handleInputChange} onKeyDown={(e) => goNext(e, phoneRef)}>
              <option value="M">M</option><option value="F">F</option>
            </select>
          </div>

          <label>Phone Number</label>
          <input ref={phoneRef} name="phone" value={formData.phone} onChange={handleInputChange} onKeyDown={(e) => goNext(e, searchRef)} />

          <label>Search Tests</label>
          <div className="search-wrapper">
            <input ref={searchRef} type="text" placeholder="Type to search..." value={searchText} onChange={handleSearchChange} onKeyDown={handleSearchKeyDown} />
            {searchResults.length > 0 && (
              <div className="search-results-box">
                {searchResults.map((item, i) => (
                  <div key={i} ref={el => resultRefs.current[i] = el} className={`search-result-item ${i === focusedIndex ? "focused" : ""}`} onClick={() => handleSelectSearchTest(item.dept, item.test)}>
                    <strong>{item.test}</strong> <span>({item.dept})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formData.selectedTests.length > 0 && (
            <div className="selected-tests" ref={selectedTestsRef}>
              <h4>Selected Tests</h4>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {formData.selectedTests.map((t, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <span>✅ {t.dept} — {t.test}</span>
                    <button onClick={() => handleRemoveSelectedTest(i)} style={{ background: "#ff4d4d", color: "white", border: "none", borderRadius: "50%", width: "20px", height: "20px", cursor: "pointer", lineHeight: "18px", fontWeight: "bold", fontSize: "14px" }}>−</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="left-buttons">
            <button className="print-btn">🖨 Print Labels</button>
            <button className="save-btn" onClick={handleSave}>{isEditMode ? "💾 Update Entry" : "💾 Save Entry"}</button>
          </div>
        </div>

        <div className="right-panel">
          <h3>Manual Entry</h3>
          <label>Patient Name</label>
          <input ref={nameRef} name="name" className={errors.name ? "input-error" : ""} value={formData.name} onChange={handleInputChange} onKeyDown={(e) => goNext(e, fatherRef)} />
          <label>Father / Husband</label>
          <input ref={fatherRef} name="father" className={errors.father ? "input-error" : ""} value={formData.father} onChange={handleInputChange} onKeyDown={(e) => goNext(e, doctorRef)} />
          <label>Doctor / Consultant</label>
          <select ref={doctorRef} name="doctor" value={formData.doctor} onChange={handleInputChange} onKeyDown={(e) => goNext(e, categoryRef)}>
             <option value="">Select Doctor</option>
             <option>Dr. Anil Sharma</option>
             <option>Dr. Renu Makwana</option>
             <option>Dr. Sanjay Makwana</option>
             <option>Dr. Kapil Kumar Raheja</option>
             <option>Dr. Vivek Lakhawat</option>
             <option>Sanjeev Sanghvi</option>
             <option>Dr. Akhil Govil</option>
             <option>Dr. Jitendra Chouhan</option>
             <option>Dr. Jitendra Khetawat</option>
             <option>Dr. Ashish Joshi</option>
             <option>RMO (Redidential Medical Officer)</option>
             <option>Dr. Ashok Bishnoi</option>
             <option>Consultant Gynaecology</option>
             <option>Consultant ART</option>
             <option>Consultant Paediatrician</option>
             <option>Consultant Orthopaedic</option>
             <option>Dr. Vinod Shaily</option>
             <option>Dr. Dabi</option>
             <option>Dr. Saurabh Kuvera</option>
             <option>Dr. Pravesh Vyas</option>
             <option>Dr. Neha Agarwal</option>
             <option>Dr. Jyotsana Sharma</option>
             <option>Dr. Lalit Mohan Rathi</option>
             <option>Dr. Amit Singhvi</option>
             <option>Dr. Consultant Obstretrics</option>



          </select>
          <label>Category</label>
          <select ref={categoryRef} name="category" value={formData.category} onChange={handleInputChange} onKeyDown={(e) => goNext(e, sourceRef)}>
            <option value="">Select Category</option>
            <option>RGHS</option>
            <option>CGHS</option>
            <option>ECHS</option>
            <option>General</option>
            <option>Insurance</option>
            <option>AAI</option>
            <option>CAPF</option>
            <option>Chiranjeevi Swasthiya Bima Yojna</option>
            <option>Food Cooperation Of India</option>
            <option>Health Package</option>
            <option>ICMR</option>
            <option>IIT</option>
            <option>Indian Oil Corporation Of India</option>
            <option>ISRO</option>
            <option>Oil India</option>
            <option>ONGC</option>
            <option>Railways</option>
            <option>RHB</option>
            <option>TPA</option>
          </select>

          <h4 style={{marginTop: '20px'}}>Departments</h4>
          <div className="checkboxes">
            {departments.map((dept) => (
              <div key={dept.key} className="dept-block">
                <div className="dept-header" onClick={() => toggleDept(dept.key)}>
                  <strong>{dept.label}</strong>
                  <span>{formData.expandedDept[dept.key] ? "▲" : "▼"}</span>
                </div>
                {formData.expandedDept[dept.key] && (
                  <div className="test-list">
                    {(testMapping[dept.label] || []).map((test, idx) => {
                      const isChecked = formData.selectedTests.some((t) => t.dept === dept.label && t.test === test);
                      return (
                        <label key={idx} className="test-item">
                          <input type="checkbox" checked={isChecked} onChange={(e) => handleTestCheckbox(dept.label, test, e.target.checked)} />
                          {test}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}