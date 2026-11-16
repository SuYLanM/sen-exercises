import { MySqlConnection } from "./db";
import { SmtpMailer } from "./mailer";
import { OrderValidator } from "./orderValidator";
import type { Order, Receipt } from "./order";

/**
 * GOD CLASS.
 * Diese Klasse validiert, rechnet, speichert, mailt und loggt, alles auf einmal.
 */
export class OrderService {
  // Öffentlicher interner Zustand: jeder darf daran drehen.
  public lastReceipt: Receipt | null = null;
  public sentMails = 0;

  readonly #validator = new OrderValidator();

  validate(order: Order): string[] {
    return this.#validator.validate(order);
  }

  calculate(order: Order): Receipt {
    let subtotal = 0;
    for (const item of order.items) {
      subtotal += item.unitPriceCents * item.quantity;
    }

    // Rabattlogik: Kundentyp + Mengenrabatt (Prozent)
    let percent = 0;
    if (order.customerType === "premium") {
      percent = 10;
    } else if (order.customerType === "student") {
      percent = 5;
    } else {
      percent = 0;
    }
    if (subtotal >= 50000) {
      percent = percent + 5;
    }
    const discount = Math.round((subtotal * percent) / 100);
    const net = subtotal - discount;

    // Mehrwertsteuer in Basispunkten (1900 = 19 %)
    let vatBps = 0;
    if (order.country === "DE") {
      vatBps = 1900;
    } else if (order.country === "AT") {
      vatBps = 2000;
    } else if (order.country === "CH") {
      vatBps = 810;
    }
    const vat = Math.round((net * vatBps) / 10000);

    // Versand
    let shipping = 0;
    if (order.country === "CH") {
      shipping = 1499;
    } else if (net < 5000) {
      shipping = 499;
    }

    return {
      orderId: order.id,
      subtotalCents: subtotal,
      discountCents: discount,
      netCents: net,
      vatCents: vat,
      shippingCents: shipping,
      totalCents: net + vat + shipping,
    };
  }

  placeOrder(order: Order): Receipt {
    console.log(`[LOG] placeOrder ${order.id} gestartet`);

    const errors = this.validate(order);
    if (errors.length > 0) {
      console.log(`[LOG] placeOrder ${order.id} abgelehnt: ${errors.join("; ")}`);
      throw new Error("Ungültige Bestellung: " + errors.join("; "));
    }

    const receipt = this.calculate(order);

    // Persistenz: Verbindung wird direkt hier erzeugt, SQL per String-Concatenation
    const db = new MySqlConnection();
    db.execute(
      "INSERT INTO orders (id, email, total_cents) VALUES ('" +
        order.id + "', '" + order.customerEmail + "', " + receipt.totalCents + ")",
    );
    for (const item of order.items) {
      db.execute(
        "INSERT INTO order_items (order_id, sku, qty) VALUES ('" +
          order.id + "', '" + item.sku + "', " + item.quantity + ")",
      );
    }

    // Benachrichtigung: Mailer wird ebenfalls direkt hier erzeugt
    const mailer = new SmtpMailer();
    mailer.send(
      order.customerEmail,
      "Bestellbestätigung " + order.id,
      "Danke für Ihre Bestellung! Gesamtbetrag: " + (receipt.totalCents / 100).toFixed(2) + " EUR",
    );
    this.sentMails++;

    this.lastReceipt = receipt;
    console.log(`[LOG] placeOrder ${order.id} abgeschlossen, Summe ${receipt.totalCents} Cent`);
    return receipt;
  }
}
