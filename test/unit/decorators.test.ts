/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { t } from "@typespec/compiler/testing";
import { $info, $externalDocs, getInfo, getExternalDocs } from "../../src/index.js";
import { DecoratorContext } from "@typespec/compiler";

describe("Unit: Decorators", () => {
  it("should set and get info state", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { TestService, program } = await runner.compile(t.code`
      @service(#{ title: "My Service" })
      namespace ${t.namespace("TestService")} {}
    `);

    const mockContext = {
      program,
      call: {} as any,
      getArgumentTarget: () => TestService,
    } as unknown as DecoratorContext;

    const infoObj = {
      version: "1.2.3",
      description: "My Test API",
    } as any;

    $info(mockContext, TestService, infoObj);

    const state = getInfo(program, TestService);
    expect(state?.version).toBe("1.2.3");
    expect(state?.description).toBe("My Test API");
  });

  it("should set and get externalDocs state", async () => {
    const runner = await AsyncAPITester.createInstance();
    const { TestTarget, program } = await runner.compile(t.code`
      namespace ${t.namespace("TestTarget")} {}
    `);

    const mockContext = {
      program,
      call: {} as any,
      getArgumentTarget: () => TestTarget,
    } as unknown as DecoratorContext;

    $externalDocs(mockContext, TestTarget, "https://example.com", "Desc");

    const state = getExternalDocs(program, TestTarget);
    expect(state?.url).toBe("https://example.com");
    expect(state?.description).toBe("Desc");
  });
});
