/**
 * generateInvoice.js
 *
 * Generates a branded PDF invoice for an Irhas'Inn order using pdfkit.
 * Takes a fully populated order object and returns a PDF buffer.
 *
 * Brand colors: #222831 (dark), #C8A84E (gold), #EEEEEE (light gray)
 */

// Brand palette
const DARK = "#222831";
const GOLD = "#C8A84E";
const LIGHT = "#EEEEEE";
const WHITE = "#FFFFFF";
const TEXT_MUTED = "#6B7280";
const TEXT_DARK = "#111827";

/**
 * Format a number as PKR currency string.
 */
function fmtPKR(n) {
  return `Rs ${Number(n || 0).toLocaleString("en-PK")}`;
}

/**
 * Generate a branded PDF invoice buffer for the given order.
 *
 * @param {Object} order - Fully populated order document (use populateOrder query).
 * @returns {Promise<Buffer>} - The generated PDF as a Buffer.
 */
export async function generateInvoice(order) {
  // pdfkit is ~1MB — lazy-loaded only when an invoice is actually generated,
  // so every other module that imports this file stays light (serverless
  // cold-start friendly). Equivalent to `import PDFDocument from "pdfkit"`.
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        info: {
          Title: `Invoice - Order #${order.serialNumber || order._id}`,
          Author: "Irhas'Inn",
          Subject: "Order Invoice",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ─── Helper: draw a horizontal line ───
      const hLine = (y, color = LIGHT, width = doc.page.width - 80) => {
        doc
          .moveTo(40, y)
          .lineTo(40 + width, y)
          .strokeColor(color)
          .lineWidth(1)
          .stroke();
      };

      // ─── HEADER ───
      // Gold accent bar at top
      doc
        .rect(0, 0, doc.page.width, 6)
        .fill(GOLD);

      // Brand name
      doc
        .fontSize(26)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text("Irhas'Inn", 40, 24);

      // Tagline
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(TEXT_MUTED)
        .text("Premium Quality — Delivered with Care Across Pakistan", 40, 54);

      // Invoice label — right-aligned
      const invoiceLabelY = 24;
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor(GOLD)
        .text("INVOICE", doc.page.width - 40 - 100, invoiceLabelY, {
          width: 100,
          align: "right",
        });

      // Order number below invoice label
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(TEXT_MUTED)
        .text(
          `#${order.serialNumber || order._id.toString().slice(-8).toUpperCase()}`,
          doc.page.width - 40 - 100,
          44,
          { width: 100, align: "right" }
        );

      hLine(70);

      // ─── ORDER META ───
      const metaY = 84;
      doc.fontSize(9).font("Helvetica");

      // Left column
      doc.fillColor(TEXT_MUTED).text("Order Date", 40, metaY);
      doc.fillColor(TEXT_DARK).font("Helvetica-Bold")
        .text(order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" }) : "—", 40, metaY + 12);

      doc.fillColor(TEXT_MUTED).font("Helvetica").text("Payment Method", 40, metaY + 32);
      doc.fillColor(TEXT_DARK).font("Helvetica-Bold")
        .text(order.paymentMethod || "Cash on Delivery", 40, metaY + 44);

      // Right column
      const rightColX = doc.page.width - 40 - 180;
      doc.fillColor(TEXT_MUTED).font("Helvetica").text("Order Status", rightColX, metaY);
      doc.fillColor(GOLD).font("Helvetica-Bold")
        .text(order.status || "Pending", rightColX, metaY + 12);

      doc.fillColor(TEXT_MUTED).font("Helvetica").text("Payment Status", rightColX, metaY + 32);
      doc.fillColor(TEXT_DARK).font("Helvetica-Bold")
        .text((order.paymentStatus || "pending").charAt(0).toUpperCase() + (order.paymentStatus || "pending").slice(1), rightColX, metaY + 44);

      hLine(metaY + 72);

      // ─── CUSTOMER INFO ───
      const customerY = metaY + 86;
      doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
        .text("Bill To", 40, customerY);

      doc.fontSize(9).font("Helvetica").fillColor(TEXT_DARK);

      const customerName = order.user?.username || order.shippingAddress?.fullName || "Customer";
      const customerEmail = order.user?.email || "";
      const customerPhone = order.shippingAddress?.phoneNo || "";

      let customerTextY = customerY + 16;

      if (customerName) {
        doc.font("Helvetica-Bold").text(customerName, 40, customerTextY);
        customerTextY += 14;
      }
      if (customerEmail) {
        doc.font("Helvetica").fillColor(TEXT_MUTED).text(customerEmail, 40, customerTextY);
        customerTextY += 12;
      }
      if (customerPhone) {
        doc.fillColor(TEXT_DARK).font("Helvetica").text(customerPhone, 40, customerTextY);
        customerTextY += 12;
      }

      // Shipping address
      const shipAddr = order.shippingAddress || {};
      doc.fillColor(TEXT_MUTED).font("Helvetica");
      if (shipAddr.address) doc.text(shipAddr.address, 40, customerTextY);
      customerTextY += 12;
      if (shipAddr.city) doc.text(`${shipAddr.city}${shipAddr.country ? `, ${shipAddr.country}` : ""}`, 40, customerTextY);

      // ─── ITEMIZED TABLE ───
      const tableTopY = Math.max(customerTextY + 28, 280);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(DARK)
        .text("Order Items", 40, tableTopY);

      const tableHeaderY = tableTopY + 20;

      // Table header background
      doc
        .rect(40, tableHeaderY, doc.page.width - 80, 22)
        .fill(GOLD);

      // Table header text
      doc.fillColor(WHITE).fontSize(8).font("Helvetica-Bold");
      doc.text("ITEM", 48, tableHeaderY + 6, { width: 220 });
      doc.text("QTY", 270, tableHeaderY + 6, { width: 30, align: "center" });
      doc.text("UNIT PRICE", 310, tableHeaderY + 6, { width: 80, align: "right" });
      doc.text("TOTAL", 410, tableHeaderY + 6, { width: 90, align: "right" });

      let rowY = tableHeaderY + 28;
      let itemCount = 0;

      for (const item of order.orderItems || []) {
        if (itemCount > 0) rowY += 4;

        const product = item.product || {};
        // Price snapshot wins when present (price paid at purchase time);
        // old orders without the snapshot fall back to the current product
        // price so invoices never break.
        const name = item.productName || product.name || "Product";
        const qty = item.quantity || 1;
        const unitPrice = Number(item.unitPrice) || product.price || 0;
        const lineTotal =
          Number(item.totalItemPrice) || unitPrice * qty;

        // Variant details
        const variants = [];
        if (item.selectedColor) variants.push(`Color: ${item.selectedColor}`);
        if (item.selectedSize) variants.push(`Size: ${item.selectedSize}`);
        const customizationAnswers = item.customizationAnswers || [];
        if (customizationAnswers.length > 0) {
          customizationAnswers.forEach((ans) => {
            if (ans.value && ans.value.trim() !== "") {
              variants.push(`${ans.label}: ${ans.value}`);
            }
          });
        }
        const variantStr = variants.length > 0 ? ` (${variants.join(", ")})` : "";

        // Row background for alternating items
        if (itemCount % 2 === 0) {
          doc
            .rect(40, rowY - 2, doc.page.width - 80, 22 + (variantStr ? 10 : 0))
            .fill("#F9FAFB");
        }

        doc.fillColor(TEXT_DARK).fontSize(8.5).font("Helvetica");
        doc.text(`${name}${variantStr}`, 48, rowY, { width: 220 });
        doc.text(String(qty), 270, rowY, { width: 30, align: "center" });
        doc.text(fmtPKR(unitPrice), 310, rowY, { width: 80, align: "right" });
        doc.font("Helvetica-Bold").text(fmtPKR(lineTotal), 410, rowY, { width: 90, align: "right" });

        rowY += variantStr ? 32 : 24;
        itemCount++;
      }

      // ─── ORDER SUMMARY ───
      const summaryY = rowY + 16;

      // Divider
      hLine(summaryY - 6);

      const summaryLeftX = 310;
      const summaryValX = 410;
      const summaryWidth = 90;
      const lineH = 18;

      doc.fontSize(9).font("Helvetica");

      // Subtotal
      doc.fillColor(TEXT_MUTED).text("Subtotal", summaryLeftX, summaryY);
      doc.fillColor(TEXT_DARK).font("Helvetica-Bold")
        .text(fmtPKR(order.itemsPrice || 0), summaryValX, summaryY, { width: summaryWidth, align: "right" });

      // Shipping
      const shippingY = summaryY + lineH;
      doc.fillColor(TEXT_MUTED).font("Helvetica").text("Shipping", summaryLeftX, shippingY);
      const shippingCost = order.shippingPrice || 0;
      doc.fillColor(TEXT_DARK).font("Helvetica-Bold")
        .text(shippingCost > 0 ? fmtPKR(shippingCost) : "FREE", summaryValX, shippingY, { width: summaryWidth, align: "right" });

      // Discount (if coupon applied)
      if (order.couponCode && order.discountAmount > 0) {
        const discountY = shippingY + lineH;
        doc.fillColor(GOLD).font("Helvetica").text(`Discount (${order.couponCode})`, summaryLeftX, discountY);
        doc.fillColor(GOLD).font("Helvetica-Bold")
          .text(`- ${fmtPKR(order.discountAmount)}`, summaryValX, discountY, { width: summaryWidth, align: "right" });

        // Total (with gold highlight) — shift down by one line
        const totalY = discountY + lineH + 4;
        doc
          .rect(300, totalY - 4, 210, 28)
          .fill(DARK);

        doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
          .text("TOTAL", 308, totalY + 4);
        doc.fillColor(GOLD).fontSize(12).font("Helvetica-Bold")
          .text(fmtPKR(order.totalPrice || 0), summaryValX, totalY + 2, { width: summaryWidth, align: "right" });
      } else {
        // Total (with gold highlight) — no discount
        const totalY = shippingY + lineH + 4;
        doc
          .rect(300, totalY - 4, 210, 28)
          .fill(DARK);

        doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
          .text("TOTAL", 308, totalY + 4);
        doc.fillColor(GOLD).fontSize(12).font("Helvetica-Bold")
          .text(fmtPKR(order.totalPrice || 0), summaryValX, totalY + 2, { width: summaryWidth, align: "right" });
      }
      const totalY = shippingY + lineH + 4;
      doc
        .rect(300, totalY - 4, 210, 28)
        .fill(DARK);

      doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
        .text("TOTAL", 308, totalY + 4);
      doc.fillColor(GOLD).fontSize(12).font("Helvetica-Bold")
        .text(fmtPKR(order.totalPrice || 0), summaryValX, totalY + 2, { width: summaryWidth, align: "right" });

      // ─── FOOTER ───
      const footerY = doc.page.height - 80;

      hLine(footerY - 4);
      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);

      doc.text("Irhas'Inn — Premium Quality Delivered with Care Across Pakistan", 40, footerY + 6);
      doc.text("Karachi, Pakistan", 40, footerY + 18);
      doc.text(
        `Thank you for your order! If you have any questions, please contact us at ${order.user?.email || "support@irhasinn.com"}`,
        40,
        footerY + 30
      );

      // Second small gold accent bar at bottom
      doc
        .rect(0, doc.page.height - 4, doc.page.width, 4)
        .fill(GOLD);

      // ─── FINALIZE ───
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export default generateInvoice;
