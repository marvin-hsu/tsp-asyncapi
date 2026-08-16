import "../..";

using AsyncAPI;

@service(#{ title: "Streetlights Kafka API" })
@info(#{
  version: "1.0.0",
  description: "The Smartylighting Streetlights API allows you to remotely manage the city lights.",
  license: #{
    name: "Apache 2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0"
  }
})
@server(
  "scram-connections",
  #{
    host: "test.mykafkacluster.org:18092",
    protocol: "kafka-secure",
    description: "Test broker secured with scramSha256"
  }
)
@server(
  "mtls-connections",
  #{
    host: "test.mykafkacluster.org:28092",
    protocol: "kafka-secure",
    description: "Test broker secured with X509"
  }
)
@securityScheme("scramSha256", #{ type: "scramSha256", description: "SASL SCRAM-SHA-256" })
@securityScheme("X509", #{ type: "X509", description: "mTLS X509" })
@useSecurity("scramSha256")
@useSecurity("X509")
namespace Streetlights;

// ==========================================
// 2. Schemas and Payloads
// ==========================================

@doc("Information about the lighting conditions of a particular streetlight.")
model LightMeasuredPayload {
  @doc("Light intensity measured in lumens.")
  @minValue(0)
  lumens: int32;

  @doc("Date and time when the measurement was taken.")
  sentAt: utcDateTime;
}

@doc("Payload to turn a streetlight on or off.")
model TurnOnOffPayload {
  @doc("Whether to turn the light on or off.")
  command: "on" | "off";

  @doc("Date and time when the command was sent.")
  sentAt: utcDateTime;
}

@doc("Payload to dim a streetlight.")
model DimLightPayload {
  @doc("Percentage to which the light should be dimmed (0 to 100).")
  @minValue(0)
  @maxValue(100)
  percentage: int32;

  @doc("Date and time when the command was sent.")
  sentAt: utcDateTime;
}

// ==========================================
// 3. Messages
// ==========================================

@doc("Headers for all streetlight messages.")
model CommonHeaders {
  @doc("Application specific tracking ID.")
  @minValue(1)
  @maxValue(100)
  `my-app-header`?: int32;
}

@message
@headers(CommonHeaders)
model LightMeasured is LightMeasuredPayload {}

@message
@headers(CommonHeaders)
model TurnOnOff is TurnOnOffPayload {}

@message
@headers(CommonHeaders)
model DimLight is DimLightPayload {}

// ==========================================
// 4. Channels and Operations
// ==========================================

@doc("The ID of the streetlight.")
scalar StreetlightId extends string;

@channel("smartylighting.streetlights.1.0.event.{streetlightId}.lighting.measured")
@doc("The topic on which measured values may be produced and consumed.")
interface LightingMeasuredChannel {
  @receive
  @summary("Inform about environmental lighting conditions of a particular streetlight.")
  @kafkaOperation(#{ clientId: #{ type: "string", `enum`: #["my-app-id"] } })
  receiveLightMeasurement(
    streetlightId: StreetlightId,
    message: LightMeasured
  ): void;
}

@channel("smartylighting.streetlights.1.0.action.{streetlightId}.turn.on")
interface LightTurnOnChannel {
  @send
  @kafkaOperation(#{ clientId: #{ type: "string", `enum`: #["my-app-id"] } })
  turnOn(
    streetlightId: StreetlightId,
    message: TurnOnOff
  ): void;
}

@channel("smartylighting.streetlights.1.0.action.{streetlightId}.turn.off")
interface LightTurnOffChannel {
  @send
  @kafkaOperation(#{ clientId: #{ type: "string", `enum`: #["my-app-id"] } })
  turnOff(
    streetlightId: StreetlightId,
    message: TurnOnOff
  ): void;
}

@channel("smartylighting.streetlights.1.0.action.{streetlightId}.dim")
interface LightsDimChannel {
  @send
  @kafkaOperation(#{ clientId: #{ type: "string", `enum`: #["my-app-id"] } })
  dimLight(
    streetlightId: StreetlightId,
    message: DimLight
  ): void;
}
