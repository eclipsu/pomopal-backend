import { registerDecorator, ValidationOptions } from 'class-validator';

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

export function IsTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && VALID_TIMEZONES.has(value);
        },
      },
    });
  };
}
