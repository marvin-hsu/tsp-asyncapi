import { beforeEach, describe, expect, it } from "vitest";
import { Interface, Operation } from "@typespec/compiler";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import {
  getOperationAction,
  getReplyAddress,
  getReplyChannel,
  getUsedSecuritySchemes,
} from "#core/decorators/index.js";
import { namespaceOf } from "../../utils/namespace.js";

/** Reads one operation of one interface of the `Test` namespace. */
function operationOf(runner: TesterInstance, interfaceName: string, name: string): Operation {
  const namespace = namespaceOf(runner.program, "Test");
  const declared: Interface | undefined = namespace.interfaces.get(interfaceName);
  const operation = declared?.operations.get(name);
  if (operation === undefined) {
    throw new Error(`The program declares no operation '${interfaceName}.${name}'.`);
  }
  return operation;
}

describe("Unit: Operation state readers", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("reads back the action and the explicit id", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send("orders.send") op publish(event: OrderCreated): void;
        @receive op consume(): OrderCreated;
        op plain(event: OrderCreated): void;
      }
    `);

    expect(
      getOperationAction(runner.program, operationOf(runner, "OrderChannel", "publish")),
    ).toEqual({ action: "send", operationId: "orders.send" });
    expect(
      getOperationAction(runner.program, operationOf(runner, "OrderChannel", "consume")),
    ).toEqual({ action: "receive" });
    expect(
      getOperationAction(runner.program, operationOf(runner, "OrderChannel", "plain")),
    ).toBeUndefined();
  });

  it("reads back the reply channel and the reply address", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): CreateOrder;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo", "Where the reply goes.")
        op createOrder(command: CreateOrder): void;

        @send op plain(command: CreateOrder): void;
      }
    `);

    const createOrder = operationOf(runner, "OrderChannel", "createOrder");
    expect(getReplyChannel(runner.program, createOrder)?.name).toBe("ReplyChannel");
    expect(getReplyAddress(runner.program, createOrder)).toEqual({
      location: "$message.header#/replyTo",
      description: "Where the reply goes.",
    });

    const plain = operationOf(runner, "OrderChannel", "plain");
    expect(getReplyChannel(runner.program, plain)).toBeUndefined();
    expect(getReplyAddress(runner.program, plain)).toBeUndefined();
  });

  it("reads back the schemes an operation requires", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @securityScheme("first", #{ type: "plain" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @useSecurity("first")
        @useSecurity("first")
        op publish(event: OrderCreated): void;
      }
    `);

    // A name given more than once yields one entry. AsyncAPI reads the array
    // as OR, so a repeat adds nothing.
    expect(
      getUsedSecuritySchemes(runner.program, operationOf(runner, "OrderChannel", "publish")),
    ).toEqual(["first"]);
  });
});
