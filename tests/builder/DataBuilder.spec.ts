import DataBuilder from '../../src/builder/DataBuilder';
import {IColumnDesc, Column, ITypeFactory} from '../../src/model';

interface IMyCustomDesc extends IColumnDesc {
  test: string;
}


describe('DataBuilder', () => {
  describe('registerColumnType', () => {
    it('simple constructor', () => {
      class CustomColumn extends Column {
      }
      expect(new DataBuilder([]).registerColumnType('custom', CustomColumn)).toBeDefined();
    });
    it('simple constructor', () => {
      class CustomColumn extends Column {
        constructor(id: string, desc: Readonly<IColumnDesc>) {
          super(id, desc);
        }
      }
      expect(new DataBuilder([]).registerColumnType('custom', CustomColumn)).toBeDefined();
    });
    it('full constructor', () => {
      class CustomColumn extends Column {
        constructor(id: string, desc: Readonly<IMyCustomDesc>) {
          super(id, desc);
          console.log(desc.test);
        }
      }
      expect(new DataBuilder([]).registerColumnType('custom', CustomColumn)).toBeDefined();
    });
    it('full constructor', () => {
      class CustomColumn extends Column {
        constructor(id: string, desc: Readonly<IMyCustomDesc>, factory: ITypeFactory) {
          super(id, desc);
          console.log(desc.test);
          console.log(factory);
        }
      }
      expect(new DataBuilder([]).registerColumnType('custom', CustomColumn)).toBeDefined();
    });
  });
});
