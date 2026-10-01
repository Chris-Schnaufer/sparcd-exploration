import ast
import unittest
from pathlib import Path


def load_visibility_helper(notebook: str):
    module = ast.parse((Path(__file__).parents[1] / "notebooks" / notebook).read_text())
    for cell in ast.walk(module):
        if not isinstance(cell, ast.FunctionDef) or cell.name != "_":
            continue
        helper = next(
            (statement for statement in cell.body if isinstance(statement, ast.FunctionDef) and statement.name == "_upload_is_visible"),
            None,
        )
        if helper is not None:
            ast.fix_missing_locations(helper)
            namespace = {}
            exec(compile(ast.Module(body=[helper], type_ignores=[]), notebook, "exec"), namespace)
            return namespace["_upload_is_visible"]
    raise AssertionError(f"_upload_is_visible was not found in {notebook}")


class FakeObject:
    def read(self):
        return b"{}"


class FakeClient:
    def __init__(self, objects):
        self.objects = objects

    def get_object(self, bucket, key):
        if key not in self.objects:
            raise FileNotFoundError(key)
        return FakeObject()


class UploadVisibilityTest(unittest.TestCase):
    def test_both_notebooks_hide_prefixes_without_upload_meta(self):
        for notebook in ("hello.py", "hello_wasm.py"):
            helper = load_visibility_helper(notebook)
            visible = helper.__globals__
            # The helper closes over the notebook cell's `client` parameter, so
            # bind a minimal client in its globals for this isolated check.
            visible["client"] = FakeClient({"published/UploadMeta.json"})
            self.assertTrue(helper("bucket", "published/"), notebook)
            self.assertFalse(helper("bucket", "interrupted/"), notebook)


if __name__ == "__main__":
    unittest.main()
