// Schema annotations: encode, defaults, deprecated, and visibility.

        @service(#{ title: "Order Events" })
        namespace Orders;

        @doc("Everything that describes a value without naming its type.")
        @externalDocs("https://example.com/annotations", "The annotation guide.")
        model Details {
          @encode("unixTimestamp", int32)
          placedAt: utcDateTime;

          @encode(BytesKnownEncoding.base64url)
          blob: bytes;

          @minLength(2)
          @maxLength(64)
          @pattern("^[a-z]+$")
          @example("ab")
          @example("cd")
          slug?: string = "ab";

          @minValue(1)
          @maxValue(10)
          retries?: int32 = 3;

          enabled?: boolean = false;

          @secret
          token: string;

          #deprecated "use fullName instead"
          name?: string;

          @invisible(Lifecycle)
          internalOnly: string;

          @jsonSchemaExtension("x-owner", "orders-team")
          owner: string;
        }

        @message
        model OrderDetailed {
          details: Details;
        }
      