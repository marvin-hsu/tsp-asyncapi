# Models

## Models

A named model becomes an entry in `components.schemas`, and a use site references it through `$ref`. Optional properties (`?`) stay out of `required`. Arrays become `type: array`, and `Record<T>` becomes `type: object` with `additionalProperties`.

```typespec
model Order {
  id: string;
  amount: float64;
  items: OrderItem[];
  metadata: Record<string>;
  note?: string;
}

model OrderItem {
  productId: string;
  quantity: int32;
}
```

```yaml
components:
  schemas:
    OrderItem:
      type: object
      properties:
        productId:
          type: string
        quantity:
          type: integer
          format: int32
      required:
        - productId
        - quantity
    Order:
      type: object
      properties:
        id:
          type: string
        amount:
          type: number
          format: double
        items:
          type: array
          items:
            $ref: "#/components/schemas/OrderItem"
        metadata:
          type: object
          additionalProperties:
            type: string
        note:
          type: string
      required:
        - id
        - amount
        - items
        - metadata
```
