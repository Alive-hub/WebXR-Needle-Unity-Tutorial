using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.AI;

public class NavMeshExporter : MonoBehaviour
{
    [ContextMenu("Export NavMesh")]
    public void ExportNavMesh()
    {
        // Get the triangulation of the baked navmesh.
        NavMeshTriangulation navMeshData = NavMesh.CalculateTriangulation();

        StringBuilder sb = new StringBuilder();
        sb.AppendLine("o NavMesh");

        // Write vertices.
        foreach (Vector3 vertex in navMeshData.vertices)
        {
            sb.AppendLine($"v {-vertex.x} {vertex.y} {vertex.z}");
        }

        // Write faces (indices are 0-based, OBJ requires 1-based indexing).
        for (int i = 0; i < navMeshData.indices.Length; i += 3)
        {
            int a = navMeshData.indices[i] + 1;
            int b = navMeshData.indices[i + 1] + 1;
            int c = navMeshData.indices[i + 2] + 1;
            // Swap the last two indices to reverse the winding order.
            sb.AppendLine($"f {a} {c} {b}");
        }

        // Save the OBJ file (for example, to your Assets folder)
        string filePath = Path.Combine(Application.dataPath, "NavMesh.obj");
        File.WriteAllText(filePath, sb.ToString());
        
        
        // Open the folder in Finder/Explorer
        EditorUtility.RevealInFinder(filePath);
        Debug.Log("NavMesh exported to " + filePath);
    }
}
