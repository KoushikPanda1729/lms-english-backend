import Stripe from "stripe"
import { Config } from "../../../config/config"
import type {
  IPaymentProvider,
  CreateCheckoutParams,
  CheckoutResult,
  WebhookEvent,
} from "./payment-provider.interface"

export class StripeProvider implements IPaymentProvider {
  readonly name = "stripe"

  private readonly stripe: Stripe

  constructor() {
    this.stripe = new Stripe(Config.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    })
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.amount * 100, // convert rupees → paise (Stripe smallest unit)
            product_data: {
              name: params.courseTitle,
            },
          },
          quantity: 1,
        },
      ],
      metadata: params.metadata,
      success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: params.cancelUrl,
    })

    return {
      providerSessionId: session.id,
      checkoutUrl: session.url!,
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      Config.STRIPE_WEBHOOK_SECRET,
    )

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      return {
        type: "payment.success",
        providerSessionId: session.id,
        providerPaymentId: (session.payment_intent as string) ?? null,
        amountPaid: session.amount_total, // actual amount Stripe charged
        metadata: (session.metadata as Record<string, string>) ?? {},
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge
      return {
        type: "payment.refunded",
        providerSessionId: "",
        providerPaymentId: charge.id,
        amountPaid: null,
        metadata: {},
      }
    }

    return {
      type: "payment.failed",
      providerSessionId: "",
      providerPaymentId: null,
      amountPaid: null,
      metadata: {},
    }
  }
}
