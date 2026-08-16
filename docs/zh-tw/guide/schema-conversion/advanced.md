# Advanced (進階處理)

## Template

具現化的 template 取得依參數推導的穩定名稱：

```typespec
model Page<T> {
  items: T[];
  total: int32;
}

model Uses {
  a: Page<string>;
  b: Page<Order>;
}
```

```yaml
components:
  schemas:
    PageString:
      type: object
      properties:
        items:
          type: array
          items:
            type: string
        total:
          type: integer
          format: int32
      required:
        - items
        - total
    PageOrder:
      # ... 同樣形狀，items 為 $ref Order
```

若要自訂名稱，用 compiler 內建的 `@friendlyName`：

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Uses2 {
  e: Envelope<Order>; // 註冊為 "OrderEnvelope"
}
```

若具現化的參數沒有可用的身分（匿名 model、tuple 等），該型別在使用處內聯，不合成名稱。這與 TypeSpec 官方 emitter 的行為一致。

## Schema key 與名稱衝突

一般宣告的 `components.schemas` key 是宣告名稱加 namespace 鏈前綴。不同 namespace 的同名 model 因此不會相撞。（schema 層尚未接上輸出，前綴的確切格式仍在檢討中，先不要依賴它。）template 具現化的 key 由 template 名稱與參數組成，如上所示。

若兩個宣告解析到同一個 key（例如 `@friendlyName` 撞名，或 model 名稱撞到 template 具現化的推導名稱），回報 [`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key) **錯誤**。emitter 絕不靜默改名。
