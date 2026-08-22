// Schema composition: inheritance, discriminator, and unions.

        @service(#{ title: "Order Events" })
        namespace Orders;

        @discriminator("kind")
        model Pet {
          kind: string;
          name: string;
        }

        model Cat extends Pet {
          kind: "cat";
          lives: int32;
        }

        model Dog extends Pet {
          kind: "dog";
        }

        @discriminated
        union Envelope {
          cat: Cat,
          dog: Dog
        }

        @oneOf
        union Payment {
          card: string,
          cash: int32
        }

        union Channel {
          web: "web",
          app: "app"
        }

        enum Priority {
          low,
          high
        }

        @message
        model PetAdopted {
          pet: Pet;
          envelope: Envelope;
          payment: Payment;
          origin: Channel;
          priority: Priority;
        }
      