// The smallest complete document this emitter can produce.
import "tsp-asyncapi";

using AsyncAPI;

// `@service` gives `info.title`. `@info` gives `info.version` and the rest
// of the `info` block. `info.version` is required, so `@info` is required
// too once you declare a service.
@service(#{ title: "Hello Service" })
@info(#{
  version: "1.0.0",
  description: "The smallest AsyncAPI document this emitter can produce.",
})
namespace HelloService;

/**
 * A greeting sent to one recipient.
 */
// `@message` marks this model as an AsyncAPI message. The model itself is
// the payload. The model reaches `components.schemas`, and the message
// reaches `components.messages` with a `payload` reference to that schema.
@message
model Greeting {
  /** The recipient of the greeting. */
  to: string;

  /** The text of the greeting. */
  text: string;
}

/**
 * Greetings sent to every listener.
 */
// `@channel` declares one channel on this interface. The key in the emitted
// `channels` map is the interface name, `Greetings`.
// The channel owns the operations declared directly inside the interface.
// The emitter walks the parameters and the return type of each of those
// operations. Every `@message` model it finds becomes an entry in the
// channel's `messages` map. So `Greeting` reaches the channel through the
// `event` parameter of `sendGreeting` below.
@channel("hello.greetings")
interface Greetings {
  // `@send` marks this operation as a message this application sends. The
  // operation then reaches the `operations` map, under its own name.
  // The parameter carries `Greeting` to the channel. It does that with or
  // without `@send`, because the channel reads the signature either way.
  @send
  op sendGreeting(event: Greeting): void;
}
