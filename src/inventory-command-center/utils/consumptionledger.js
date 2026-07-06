

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db } from "../../firebaseConfig";

export const addConsumptionLedgerEntry = async ({
  productName,
  batchNo,
  boxNo,
  machine,
  inventoryType,
  metricType,
  level,
  testName,
  actionType,
  qty
}) => {
  try {
    await addDoc(
      collection(db, "consumption_ledger"),
      {
        productName,
        batchNo,
        boxNo,
        machine,
        inventoryType,
        metricType,
        ...(level ? { level } : {}),
        testName,
        actionType,
        qty,
        timestamp: serverTimestamp()
      }
    );
  } catch (error) {
    console.error(
      "Consumption Ledger Error:",
      error
    );
  }
};