/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {TestBed} from '@angular/core/testing';

import {PreActivation, Router} from '../src/router';
import {RouterOutletMap} from '../src/router_outlet_map';
import {ActivatedRouteSnapshot, InheritedResolve, RouterStateSnapshot, createEmptyStateSnapshot} from '../src/router_state';
import {DefaultUrlSerializer} from '../src/url_tree';
import {TreeNode} from '../src/utils/tree';
import {RouterTestingModule} from '../testing/router_testing_module';

describe('Router', () => {
  describe('resetRootComponentType', () => {
    class NewRootComponent {}

    beforeEach(() => { TestBed.configureTestingModule({imports: [RouterTestingModule]}); });

    it('should not change root route when updating the root component', () => {
      const r: Router = TestBed.get(Router);
      const root = r.routerState.root;

      r.resetRootComponentType(NewRootComponent);

      expect(r.routerState.root).toBe(root);
    });
  });

  describe('PreActivation', () => {
    const serializer = new DefaultUrlSerializer();
    const inj = {get: (token: any) => () => `${token}_value`};
    let empty: RouterStateSnapshot;

    beforeEach(() => { empty = createEmptyStateSnapshot(serializer.parse('/'), null); });

    it('should resolve data', () => {
      const r = new InheritedResolve(InheritedResolve.empty, {data: 'resolver'});
      const n = createActivatedRouteSnapshot('a', {resolve: r});
      const s = new RouterStateSnapshot('url', new TreeNode(empty.root, [new TreeNode(n, [])]));

      checkResolveData(s, empty, inj, () => {
        expect(s.root.firstChild.data).toEqual({data: 'resolver_value'});
      });
    });

    it('should wait for the parent resolve to complete', () => {
      const parentResolve = new InheritedResolve(InheritedResolve.empty, {data: 'resolver'});
      const childResolve = new InheritedResolve(parentResolve, {});

      const parent = createActivatedRouteSnapshot('a', {resolve: parentResolve});
      const child = createActivatedRouteSnapshot('b', {resolve: childResolve});

      const s = new RouterStateSnapshot(
          'url', new TreeNode(empty.root, [new TreeNode(parent, [new TreeNode(child, [])])]));

      const inj = {get: (token: any) => () => Promise.resolve(`${token}_value`)};

      checkResolveData(s, empty, inj, () => {
        expect(s.root.firstChild.firstChild.data).toEqual({data: 'resolver_value'});
      });
    });

    it('should copy over data when creating a snapshot', () => {
      const r1 = new InheritedResolve(InheritedResolve.empty, {data: 'resolver1'});
      const r2 = new InheritedResolve(InheritedResolve.empty, {data: 'resolver2'});

      const n1 = createActivatedRouteSnapshot('a', {resolve: r1});
      const s1 = new RouterStateSnapshot('url', new TreeNode(empty.root, [new TreeNode(n1, [])]));
      checkResolveData(s1, empty, inj, () => {});

      const n21 = createActivatedRouteSnapshot('a', {resolve: r1});
      const n22 = createActivatedRouteSnapshot('b', {resolve: r2});
      const s2 = new RouterStateSnapshot(
          'url', new TreeNode(empty.root, [new TreeNode(n21, [new TreeNode(n22, [])])]));
      checkResolveData(s2, s1, inj, () => {
        expect(s2.root.firstChild.data).toEqual({data: 'resolver1_value'});
        expect(s2.root.firstChild.firstChild.data).toEqual({data: 'resolver2_value'});
      });
    });

    it('should add checks in the correct order during traversal', () => {
      let guardOrder : number[] = [];
      const guardInjector = {
        get: (token: any) => {
          if (typeof token === "number") {
            return () => {
              guardOrder.push(token);
              return `${token}_value`;
            }
          }
          return () => `${token}_value`;
        }
      }

      const nodeConfig = {canDeactivate: [2], canActivate: [3]};
      const n1a = createActivatedRouteSnapshot('a', {}, nodeConfig, {param: 'a'});
      const n1b = createActivatedRouteSnapshot('b', {}, nodeConfig, {param: 'b'});
      const n2 = createActivatedRouteSnapshot('a', {}, {canDeactivate: [1], canActivate: [-1]});
      const n3 = createActivatedRouteSnapshot('b', {}, {canDeactivate: [-1], canActivate: [4]});

      const s1 = new RouterStateSnapshot('a/a', new TreeNode(empty.root, [new TreeNode(n1a, [new TreeNode(n2, [])])]));
      const s2 = new RouterStateSnapshot('b/b', new TreeNode(empty.root, [new TreeNode(n1b, [new TreeNode(n3, [])])]));
      const p = new PreActivation(s2, s1, guardInjector);

      p.traverse(new RouterOutletMap());
      p.checkGuards();

      expect(guardOrder).not.toContain(-1);
      expect(guardOrder).toEqual([1,2,3,4]);
    })
  });
});

function checkResolveData(
    future: RouterStateSnapshot, curr: RouterStateSnapshot, injector: any, check: any): void {
  const p = new PreActivation(future, curr, injector);
  p.traverse(new RouterOutletMap());
  p.resolveData().subscribe(check, (e) => { throw e; });
}

function createActivatedRouteSnapshot(cmp: string, extra: any = {}, config: any = null, params: any = {}): ActivatedRouteSnapshot {
  return new ActivatedRouteSnapshot(
      <any>null, params, <any>null, <any>null, <any>null, <any>null, <any>cmp, <any>config, <any>null, -1,
      extra.resolve);
}
