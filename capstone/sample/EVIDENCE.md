# Evidence

## My API

Dockside Books order API at https://api.dockside-books.example/orders. I used a test key from the shop's staging site.

## A real call

I ran `get_order` with `orderId` set to `ORD-1041` and the staging key.

```text
tool: get_order
request: GET /orders/ORD-1041
status: 200
answer: {"id":"ORD-1041","status":"packed","items":2}
```

## What I left out

- `POST /refunds`: it moves money, and a model should not do that without a person in the loop.
- `GET /customers`: it lists every customer, and a model does not need that to answer an order question.
