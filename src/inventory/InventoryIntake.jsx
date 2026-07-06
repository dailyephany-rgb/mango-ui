
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { 
  collection, 
  onSnapshot, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit 
} from "firebase/firestore";
import reagentData from "./reagents.json";
import "./InventoryIntake.css";

export default function InventoryIntake() {
  const [view, setView] = useState("bill");
  const [billItems, setBillItems] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]); 

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [selectedReagent, setSelectedReagent] = useState(null);
  const [lotNo, setLotNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [boxNo, setBoxNo] = useState("");
  
  const [hsnCode, setHsnCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);
  const [unitPer, setUnitPer] = useState("Unit");
  const [discountPct, setDiscountPct] = useState(0);
  const [gstRate, setGstRate] = useState(18);
  const [totalAmount, setTotalAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  
  
 
  // Simplified Inventory States

  const [totalInventoryQty, setTotalInventoryQty] = useState(1);
  const [inventoryUnit, setInventoryUnit] = useState("ML");
  const [machineName, setMachineName] = useState("");
  const [inventoryType, setInventoryType] = useState("testOrCycle");

  const filteredLogs = recentLogs.filter(item => {
    if (!item.invoiceDate) return true; 
    return item.invoiceDate >= startDate && item.invoiceDate <= endDate;
  });

  useEffect(() => {
    const q = query(collection(db, "inventory_logs"), orderBy("timeAddedAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentLogs(logs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "invoices"), orderBy("timeAddedAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const invs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentInvoices(invs);
    });
    return () => unsub();
  }, []);

  const getGroupedData = (data, key) => {
    return data.reduce((acc, item) => {
      const groupValue = item[key] || "Unknown";
      if (!acc[groupValue]) acc[groupValue] = { items: [], total: 0 };
      acc[groupValue].items.push(item);
      acc[groupValue].total += Number(item.totalAmount || 0);
      return acc;
    }, {});
  };

  useEffect(() => {
    const qty = Number(quantity);
    const r = Number(rate);
    const disc = Number(discountPct);
    const gst = Number(gstRate);
    const discountedPrice = (qty * r) * (1 - disc / 100);
    const finalAmount = discountedPrice * (1 + gst / 100);
    setTotalAmount(finalAmount.toFixed(2));
  }, [quantity, rate, discountPct, gstRate]);


  const handleReagentChange = (e) => {

    const name = e.target.value;
  
    const reagentObj = reagentData.find(r => r.name === name);
  
    if (reagentObj) {
  
      setSelectedReagent(reagentObj);
  
      setHsnCode(reagentObj.hsn || "");
  
      // inventory type from JSON
      setInventoryType(reagentObj.inventoryType);
  
      // machine name from JSON
      setMachineName(reagentObj.machineName);
  
      // metric type from JSON
      const metric = reagentObj.metricType?.toLowerCase();
  
      if (metric === "tests") {
        setInventoryUnit("Tests");
      }
      else if (metric === "cycles") {
        setInventoryUnit("Cycles");
      }
      else if (metric === "ml") {
        setInventoryUnit("ML");
      }
      else if (metric === "packs") {
        setInventoryUnit("Packs");
      }
  
      const multiplier = reagentObj.defaultMultiplier || 1;
  
      setTotalInventoryQty(multiplier);
  
    }
  };

  const addToBill = () => {
    if (!selectedReagent || !lotNo) return alert("Please fill reagent details");
    
    const newItem = {
      id: Date.now().toString(),
      reagentName: selectedReagent.name,
      machineName,
      inventoryType,
      metricType: selectedReagent.metricType,
      hsnCode,
      lotNo,
      boxNo,
      expiryDate,
      quantity: Number(quantity),
      rate: Number(rate),
      per: unitPer,
      discountPct: Number(discountPct),
      gstRate: Number(gstRate),
      totalAmount: Number(totalAmount),
      inventoryType,
      ...(inventoryType !== "Consumable" && {

        inventoryQty: Number(totalInventoryQty),
      
        inventoryUnit: inventoryUnit,
      
        ...(inventoryUnit === "ML"
          ? { totalML: Number(totalInventoryQty) }
          : { totalTests: Number(totalInventoryQty) }
        )
      
      }),

      invoiceDate,
      supplier 
    };
    setBillItems([...billItems, newItem]);
    setSelectedReagent(null);
    setLotNo("");
    setBoxNo("");
    setQuantity(1);
    setRate(0);
    setDiscountPct(0);
    setHsnCode("");
    setInventoryType("");
    setInventoryUnit("Tests");
    setTotalInventoryQty(1);
  };

  const confirmAllToFridge = async () => {
    if (saving) return;
if (billItems.length === 0) return alert("No items in bill");
if (!invoice) return alert("Please enter an Invoice Number");
if (!invoiceDate) return alert("Please select Invoice Date");

setSaving(true);
    const batch = writeBatch(db);
    const cleanInvoiceId = invoice.replace(/\//g, "-");
    try {
      const grandTotal = billItems.reduce((sum, item) => sum + Number(item.totalAmount), 0);
      const itemNamesList = billItems.map(i => i.reagentName).join(", ");
      const invoiceRef = doc(db, "invoices", cleanInvoiceId);
      batch.set(invoiceRef, {
        invoiceNumber: invoice,
        supplier,
        invoiceDate,
        grandTotal: grandTotal.toFixed(2),
        itemNames: itemNamesList,
        itemCount: billItems.length,
        timeAddedAt: serverTimestamp(),
      });
      billItems.forEach(item => {
        const logRef = doc(collection(db, "inventory_logs"));
        batch.set(logRef, { ...item, supplier, invoice, status: "In Storage", timeAddedAt: serverTimestamp() });
      });
      await batch.commit();
      setBillItems([]);
      setInvoice("");
      setSupplier("");
      setInvoiceDate("");
      alert(`Bill ${invoice} recorded successfully!`);
      setSaving(false);
    } catch (err) {
      console.error(err);
      setSaving(false);
      alert("Error saving: " + err.message);
    }
  };

  const groupKey = view === 'history_reagent' ? 'reagentName' : 'invoice';
  const headerPrefix = view === 'history_reagent' ? 'PRODUCT' : 'BILL NO';

  return (
    <div className="dark-intake-wrapper">
      <header className="dark-header">
        <h1>LABORATORY INVENTORY INTAKE</h1>
        <div className="tab-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '20px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className={`tab-circle ${view === 'bill' ? 'active' : ''}`} onClick={() => setView('bill')}>🛒</button>
            <button className={`tab-circle ${view === 'history_flat' ? 'active' : ''}`} onClick={() => setView('history_flat')}>📜</button>
            <button className={`tab-circle ${view === 'history_reagent' ? 'active' : ''}`} onClick={() => setView('history_reagent')}>🧪</button>
            <button className={`tab-circle ${view === 'history_invoice' ? 'active' : ''}`} onClick={() => setView('history_invoice')}>📑</button>
          </div>
          
          {view !== 'bill' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '8px 15px', borderRadius: '6px', fontSize: '14px', border: '1px solid var(--border-color)' }}>
              <span className="dim">Date:</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span className="dim">to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
        </div>
      </header>

      <div className="dark-main-grid" style={{ gridTemplateColumns: view === 'bill' ? '420px auto' : '1fr' }}>
        {view === 'bill' && (
          <section className="entry-column">
             <div className="section-block">
              <h3 className="section-title">BILLING DETAILS</h3>
              <div className="input-group">
                  <label>Supplier Name</label>
                  <input type="text" value={supplier} onChange={(e)=>setSupplier(e.target.value)} placeholder="Enter Supplier" />
              </div>
              <div className="form-row">
                  <div className="input-group">
                      <label>Invoice Number</label>
                      <input type="text" value={invoice} onChange={(e)=>setInvoice(e.target.value)} placeholder="INV-000" />
                  </div>
                  <div className="input-group">
                      <label>Invoice Date</label>
                      <input type="date" value={invoiceDate} onChange={(e)=>setInvoiceDate(e.target.value)} />
                  </div>
              </div>
            </div>

            <div className="section-block">
              <h3 className="section-title">REAGENT ENTRY</h3>
              <div className="form-row">
                  <div className="input-group" style={{flex: 2}}>
                      <label>Standardized Name</label>
                      <select value={selectedReagent?.name || ""} onChange={handleReagentChange}>
                          <option value="">-- Search Reagent --</option>
                          {reagentData.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                      </select>
                  </div>
                  <div className="input-group">
                      <label>HSN/SAC</label>
                      <input type="text" value={hsnCode} onChange={(e)=>setHsnCode(e.target.value)} placeholder="Code" />
                  </div>
              </div>


                          
                  <div className="form-row">
              <div className="input-group">
                <label>Lot No</label>
                <input
                  type="text"
                  value={lotNo}
                  onChange={(e) => setLotNo(e.target.value)}
                />
              </div>

              {inventoryType !== "Consumable" && (
                <div className="input-group">
                  <label>Box No</label>
                  <input
                    type="text"
                    value={boxNo}
                    onChange={(e) => setBoxNo(e.target.value)}
                  />
                </div>
              )}

              <div className="input-group">
                <label>Expiry Date</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
              <div className="form-row">
                <div className="input-group">
                   <label>Qty</label>
                   <input 
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="input-group">
                   <label>Rate</label>
                   <input 
                    type="number"
                    min="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <div className="input-group">
                   <label>Per</label>
                   <select value={unitPer} onChange={(e)=>setUnitPer(e.target.value)}>
                      <option value="Unit">Unit</option>
                      <option value="Pkt">Pkt</option>
                      <option value="Box">Box</option>
                      <option value="Nos">Nos</option>
                   </select>
                </div>
              </div>




              {/* SIMPLIFIED QUANTITY ROW - APPLIES TO ALL ITEMS */}
              {inventoryType !== "Consumable" && (

              <div className="form-row">
                <div className="input-group" style={{ flex: 2 }}>
                  <label>Total Quantity / Volume</label>
                  <input 
                    type="number" 
                    min="1"
                    value={totalInventoryQty} 
                    onChange={(e) => {
                        setTotalInventoryQty(e.target.value);
                    }} 
                  />
                </div>
                <div className="input-group">
                  <label>Unit</label>
                                
                 <select
                    value={inventoryUnit}
                    onChange={(e)=>setInventoryUnit(e.target.value)}
                  >
                    <option value={inventoryUnit}>
                      {inventoryUnit}
                    </option>
                  </select>

                      </div>
                    </div>
                    )}

              

              <div className="form-row">
                <div className="input-group">
                   <label>Discount %</label>
                   <input type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                </div>
                <div className="input-group">
                   <label>GST %</label>
                   <input type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
                </div>
                <div className="input-group">
                   <label>Total Amount</label>
                   <div className="total-display" style={{color: 'var(--success)'}}>{totalAmount}</div>
                </div>
              </div>

              <button type="button" className="btn-confirm" onClick={addToBill} style={{borderStyle: 'dashed', background: 'transparent', color: 'var(--accent-blue)'}}>
                ADD TO BILL ↓
              </button>
            </div>

            <button className="btn-confirm" onClick={confirmAllToFridge} disabled={billItems.length === 0|| saving} style={{marginTop: '10px', background: 'var(--success)', color: 'white', border: 'none'}}>
                  {
        saving
           ? "Saving..."
          : `Confirm & Add to Fridge (${billItems.length})`
            }
            </button>
          </section>
        )}

        <section className="ledger-column">
          <h3 className="section-title">
            {view === 'bill' ? "CURRENT BILL PREVIEW" : 
             view === 'history_flat' ? "RECENT INTAKE HISTORY" :
             view === 'history_reagent' ? "GROUPED BY REAGENT" : "GROUPED BY INVOICE"}
          </h3>
          <div className="ledger-table-container">
            { (view === 'history_invoice' || view === 'history_reagent') ? (
              Object.entries(getGroupedData(filteredLogs, groupKey)).map(([headerValue, data]) => (
                <div key={headerValue} className="history-group-card" style={{marginBottom: '20px', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden'}}>
                  <div style={{background: '#333', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontWeight: 'bold', fontSize: '1rem', color: 'var(--accent-blue)', textTransform: 'uppercase'}}>{headerPrefix}: {headerValue}</span>
                    <span style={{color: 'var(--success)', fontWeight: 'bold', fontSize: '1rem'}}>TOTAL: ₹{data.total.toFixed(2)}</span>
                  </div>
                  <table className="ledger-table" style={{margin: 0, fontSize: '0.85rem'}}>
                    <thead>
                      <tr style={{background: 'rgba(255,255,255,0.02)'}}>
                        <th>Date</th>
                        <th>{view === 'history_reagent' ? 'Invoice' : 'Supplier'}</th>
                        <th>{view === 'history_reagent' ? 'Supplier' : 'Article Name'}</th>
                        <th>Lot No</th>
                        <th>Expiry</th>
                        <th>Qty</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="dim small">{item.invoiceDate}</td>
                          <td className="small">{view === 'history_reagent' ? item.invoice : item.supplier}</td>
                          <td className="bold">{view === 'history_reagent' ? item.supplier : item.reagentName}</td>
                          <td className="dim small">{item.lotNo}</td>
                          <td style={{color: '#ff9800'}}>{item.expiryDate}</td>
                          <td>{item.quantity} {item.per}</td>
                          <td className="bold">₹{item.totalAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Article</th>
                    <th>Lot No</th>
                    <th>Expiry</th>
                    <th>Qty</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(view === 'bill' ? billItems : filteredLogs).map(item => (
                    <tr key={item.id}>
                      <td className="dim small">{item.invoiceDate || "N/A"}</td>
                      <td className="small">{item.supplier || "N/A"}</td>
                      <td className="bold">{item.reagentName}</td>
                      <td className="dim small">{item.lotNo}</td>
                      <td className="small" style={{color: '#ff9800'}}>{item.expiryDate}</td>
                      <td>{item.quantity} {item.per}</td>
                      <td className="bold">₹{item.totalAmount}</td>
                      <td>
                        {view === 'bill' ? (
                          <button className="text-red" onClick={() => setBillItems(billItems.filter(i => i.id !== item.id))}>Remove</button>
                        ) : (
                          <span className={`status-tag ${item.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                            {item.status || "In Storage"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}