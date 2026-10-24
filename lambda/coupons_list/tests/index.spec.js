const { handler } = require('../index.js');

describe('Coupon list', () => {

  test('Should return success status', async () => {

    const expectedResponse = { message: 'Coupons API is working successfully' };

    const response = await handler({}, null);
    const responseParsed = JSON.parse(response.body);

    expect(responseParsed).toStrictEqual(expectedResponse);

  });
});