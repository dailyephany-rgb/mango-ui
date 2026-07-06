
import React, { useState, useRef, useEffect } from "react";
import "./mango.css";
import { db } from "./firebaseConfig.js";
import testMapping from "./test_mapping.json";
import { collection, serverTimestamp, setDoc, doc, getDoc } from "firebase/firestore";
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
        enteredBy:  sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: fullTimePrinted,
        timeCollected: finalTimeCollected,
        urgent: formData.urgent || false,
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

      const reportDetailsEntry = {
        regNo,
        diagnosticNo: diagNo,

        name: formData.name,

          timeCollected: finalTimeCollected,
        };

        await setDoc(
          reportDocRef,
          reportDetailsEntry,
          { merge: true }
        );


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
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/Letter_V.svg"
        alt="Logo"
        className="mango-logo"
      />
      <h1>Vasundhara Hospital Limited</h1>
    </div>
    <UserMenu />
    </header>

      <div className="mango-content">
        <div className="left-panel">
          <button className="scan-btn">📷 Scan QR</button>
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