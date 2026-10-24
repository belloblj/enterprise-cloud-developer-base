const lambda = require('../lambda/coupons_list/index.js');

test('Lambda returns success message', async () => {
  const event = {};
  const result = await lambda.handler(event);

  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body)).toEqual({
    message: "Coupons API is working successfully"
  });
});
