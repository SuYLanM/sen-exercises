import { SmtpMailer } from "./mailer";
import { OrderValidator } from "./orderValidator";
import { PriceCalculator } from "./priceCalculator";
import { OrderRepository } from "./orderRepository";
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
  readonly #priceCalculator = new PriceCalculator();
  readonly #repository = new OrderRepository();

  validate(order: Order): string[] {
    return this.#validator.validate(order);
  }

  calculate(order: Order): Receipt {
    return this.#priceCalculator.calculate(order);
  }

  placeOrder(order: Order): Receipt {
    console.log(`[LOG] placeOrder ${order.id} gestartet`);

    const errors = this.validate(order);
    if (errors.length > 0) {
      console.log(`[LOG] placeOrder ${order.id} abgelehnt: ${errors.join("; ")}`);
      throw new Error("Ungültige Bestellung: " + errors.join("; "));
    }

    const receipt = this.calculate(order);

    this.#repository.save(order, receipt);

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
