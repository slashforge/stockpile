#!/usr/bin/env bun
/**
 * Test script for PDF generation
 *
 * Run with: bun apps/backend/scripts/test-pdf.ts
 *
 * This will generate a sample invoice PDF and open it in your default viewer.
 */

import { generateInvoicePDFSatori } from "../src/services/pdf/generate-invoice-pdf-satori";
import { writeFile } from "fs/promises";
import { join } from "path";

// Sample invoice data for testing
const sampleInvoice = {
  invoice: {
    invoiceNumber: "INV-2024-0042",
    status: "sent",
    subtotal: "2500.00",
    taxRate: "8.25",
    taxAmount: "206.25",
    total: "2706.25",
    issueDate: new Date("2024-01-15"),
    dueDate: new Date("2024-02-15"),
    notes: "Payment is due within 30 days. Please include the invoice number as a reference when making the payment. For any questions, feel free to reach out.\n\nThank you for your business!",
    paymentToken: "abc123xyz",
  },
  items: [
    {
      description: "Website Development - Full-stack web application with React frontend and Node.js backend, including database design and API integration",
      quantity: "1",
      unitPrice: "1500.00",
      amount: "1500.00",
    },
    {
      description: "UI/UX Design Services",
      quantity: "10",
      unitPrice: "75.00",
      amount: "750.00",
    },
    {
      description: "Technical Consultation",
      quantity: "5",
      unitPrice: "50.00",
      amount: "250.00",
    },
  ],
  client: {
    name: "John Smith",
    email: "john.smith@acmecorp.com",
    company: "Acme Corporation",
    phone: "+1 (555) 123-4567",
    addressLine1: "123 Business Ave",
    addressLine2: "Suite 456",
    city: "San Francisco",
    state: "CA",
    postalCode: "94102",
    country: "United States",
  },
  business: {
    businessName: "TechStudio LLC",
    email: "billing@techstudio.io",
    phone: "+1 (555) 987-6543",
    website: "https://techstudio.io",
    addressLine1: "456 Innovation Blvd",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "United States",
    taxId: "12-3456789",
    logoUrl: null,
  },
  // Sample bank account for testing
  bankAccount: {
    bankName: "First National Bank",
    accountNumber: "****4567",
    routingNumber: "021000089",
    accountOwnerName: "TechStudio LLC",
    swiftCode: "FNBKUS44",
    paymentRail: "wire",
    bankAddress: "100 Wall Street, New York, NY 10005",
  },
};

// Also test without bank account
const sampleInvoiceNoBankAccount = {
  ...sampleInvoice,
  bankAccount: null,
};

// Test with paid status (includes paidAt and paidSignature)
const sampleInvoicePaid = {
  ...sampleInvoice,
  invoice: {
    ...sampleInvoice.invoice,
    invoiceNumber: "INV-2024-0041",
    status: "paid",
    paidAt: new Date("2024-01-20T14:32:00Z"),
    paidSignature: "5UfDuX6jXzKmVv8YpWJTnHxPfqwz5qC4QVyMhWNkjwKZ8hXF1yD9GmN3RsTpvM7bWfFvGhL4nKmRcXsY2hA9vJKx",
  },
  bankAccount: null,
};

async function main() {
  console.log("Generating test PDFs...\n");

  const outputDir = join(import.meta.dir, "../test-output");

  // Ensure output directory exists
  await Bun.write(join(outputDir, ".gitkeep"), "");

  try {
    // Test 1: Invoice with bank account
    console.log("1. Generating invoice with bank account...");
    const pdf1 = await generateInvoicePDFSatori(sampleInvoice);
    const path1 = join(outputDir, "invoice-with-bank.pdf");
    await writeFile(path1, pdf1);
    console.log(`   Saved to: ${path1}`);

    // Test 2: Invoice without bank account
    console.log("2. Generating invoice without bank account...");
    const pdf2 = await generateInvoicePDFSatori(sampleInvoiceNoBankAccount);
    const path2 = join(outputDir, "invoice-no-bank.pdf");
    await writeFile(path2, pdf2);
    console.log(`   Saved to: ${path2}`);

    // Test 3: Paid invoice
    console.log("3. Generating paid invoice...");
    const pdf3 = await generateInvoicePDFSatori(sampleInvoicePaid);
    const path3 = join(outputDir, "invoice-paid.pdf");
    await writeFile(path3, pdf3);
    console.log(`   Saved to: ${path3}`);

    console.log("\nAll PDFs generated successfully!");
    console.log(`\nOutput directory: ${outputDir}`);

    // Open the paid invoice PDF in default viewer (macOS)
    console.log("\nOpening paid invoice...");
    Bun.spawn(["open", path3]);

  } catch (error) {
    console.error("Error generating PDF:", error);
    process.exit(1);
  }
}

main();
