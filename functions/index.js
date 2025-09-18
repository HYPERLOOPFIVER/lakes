const functions = require("firebase-functions");
const { Resend } = require("resend");

const resend = new Resend("re_UKG2H2nw_38GWE7vQb9Zy13As4w1e3n7m");

exports.notifyShopkeeper = functions.https.onCall(async (data, context) => {
  const { to, shopName, orderId, items, total, customerPhone } = data;

  const itemListHtml = items.map(item => `
    <li>${item.quantity} × ${item.name} - ₹${item.price}</li>
  `).join('');

  try {
    const emailResponse = await resend.emails.send({
      from: "Lightupswift <onboarding@resend.dev>",
      to,
      subject: `New Order Received - ${shopName}`,
      html: `
        <h2>You received a new order!</h2>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Shop:</strong> ${shopName}</p>
        <p><strong>Total:</strong> ₹${total}</p>
        <p><strong>Customer Phone:</strong> ${customerPhone}</p>
        <ul>${itemListHtml}</ul>
      `
    });

    return { success: true, emailResponse };
  } catch (error) {
    console.error("Error sending shopkeeper email:", error);
    return { success: false, error: error.message };
  }
});

